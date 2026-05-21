// Event topic read/write — implements IWriteEvent, IReadEvents, IReadEvent, IUpdateEvent, IStreamEvents
// @work.md

import type { EventEntry, ReadEventOptions, EventDiffRequest, EventDiffResult, EventDiffBucket, UpdateEventTimestamps } from "../capabilities.ts";
import { hashEventBucket, hashBucketRoot } from "./hashing.ts";

// How long to wait between polls when no new entries are found
const STREAM_POLL_INTERVAL_MS = 1_000;
import type { StoredTopic, StoredTopicStats, StoredEvent } from "../types/stored-types.ts";
import { KV_TOPIC, KV_TOPIC_STATS, KV_EVENT, KV_EVENT_COUNTER } from "../keys.ts";

export async function writeEvent(kv: Deno.Kv, topic: string, payload: unknown): Promise<EventEntry | null> {
  const meta = await kv.get<StoredTopic>([...KV_TOPIC, topic]);
  if (!meta.value) {
    return null;
  }

  // Atomically claim the next ID by checking the counter versionstamp and retrying on conflict.
  while (true) {
    const counter = await kv.get<number>([...KV_EVENT_COUNTER, topic]);
    const stats = await kv.get<StoredTopicStats>([...KV_TOPIC_STATS, topic]);
    const id = (counter.value ?? 0) + 1;
    const now = Date.now();

    const entry: StoredEvent = { id, createdAt: now, updatedAt: now, payload };
    const newStats: StoredTopicStats = { count: (stats.value?.count ?? 0) + 1, lastUpdated: now };

    const result = await kv.atomic()
      .check(counter)
      .check(stats)
      .set([...KV_EVENT_COUNTER, topic], id)
      .set([...KV_EVENT, topic, id], entry)
      .set([...KV_TOPIC_STATS, topic], newStats)
      .commit();

    if (result.ok) {
      return entry;
    }
  }
}

export async function readEvent(kv: Deno.Kv, topic: string, id: number): Promise<EventEntry | null> {
  const meta = await kv.get<StoredTopic>([...KV_TOPIC, topic]);
  if (!meta.value) {
    return null;
  }

  const entry = await kv.get<StoredEvent>([...KV_EVENT, topic, id]);
  if (!entry.value) {
    return null;
  }

  return entry.value;
}

export async function updateEvent(kv: Deno.Kv, topic: string, id: number, payload: unknown, timestamps?: UpdateEventTimestamps): Promise<{ entry: EventEntry; created: boolean } | null> {
  const meta = await kv.get<StoredTopic>([...KV_TOPIC, topic]);
  if (!meta.value) return null;

  while (true) {
    const existing = await kv.get<StoredEvent>([...KV_EVENT, topic, id]);
    const stats = await kv.get<StoredTopicStats>([...KV_TOPIC_STATS, topic]);
    const counter = await kv.get<number>([...KV_EVENT_COUNTER, topic]);

    const isNew = existing.value === null;
    const now = Date.now();

    const entry: StoredEvent = {
      id,
      createdAt: isNew ? (timestamps?.createdAt ?? now) : existing.value!.createdAt,
      updatedAt: timestamps?.updatedAt ?? now,
      payload,
    };
    const newStats: StoredTopicStats = {
      count: (stats.value?.count ?? 0) + (isNew ? 1 : 0),
      lastUpdated: entry.updatedAt,
    };

    let atomic = kv.atomic()
      .check(existing)
      .check(stats)
      .set([...KV_EVENT, topic, id], entry)
      .set([...KV_TOPIC_STATS, topic], newStats);

    if (isNew) {
      // Advance counter past this ID so future local writeEvent calls don't collide
      atomic = atomic
        .check(counter)
        .set([...KV_EVENT_COUNTER, topic], Math.max(counter.value ?? 0, id));
    }

    const result = await atomic.commit();
    if (result.ok) return { entry, created: isNew };
  }
}

// Waits for the poll interval, resolving early if the signal is aborted.
function waitForPoll(signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, STREAM_POLL_INTERVAL_MS);
    signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

export async function* streamEvents(kv: Deno.Kv, topic: string, startId: number, signal: AbortSignal): AsyncGenerator<EventEntry> {
  const meta = await kv.get<StoredTopic>([...KV_TOPIC, topic]);
  if (!meta.value) return;

  let nextId = startId;

  while (!signal.aborted) {
    const prefix = [...KV_EVENT, topic];
    const selector = nextId > 1
      ? { prefix, start: [...KV_EVENT, topic, nextId] }
      : { prefix };

    let yieldedAny = false;
    for await (const item of kv.list<StoredEvent>(selector)) {
      if (signal.aborted) return;
      yield item.value;
      nextId = item.value.id + 1;
      yieldedAny = true;
    }

    if (!yieldedAny) {
      await waitForPoll(signal);
    }
  }
}

type BucketEntry = { id: number; updatedAt: number };

async function buildBucketMap(kv: Deno.Kv, topic: string, bucketSize: number): Promise<Map<number, BucketEntry[]>> {
  const bucketMap = new Map<number, BucketEntry[]>();
  for await (const item of kv.list<StoredEvent>({ prefix: [...KV_EVENT, topic] })) {
    const { id, updatedAt } = item.value;
    const bucketStart = Math.floor((id - 1) / bucketSize) * bucketSize;
    if (!bucketMap.has(bucketStart)) bucketMap.set(bucketStart, []);
    bucketMap.get(bucketStart)!.push({ id, updatedAt });
  }
  return bucketMap;
}

async function computeBucketHashes(bucketMap: Map<number, BucketEntry[]>, buckets: EventDiffBucket[]): Promise<string[]> {
  return Promise.all(buckets.map(bucket => {
    const entries = (bucketMap.get(bucket.start) ?? []).sort((a, b) => a.id - b.id);
    return hashEventBucket(entries);
  }));
}

function differingRanges(buckets: EventDiffBucket[], serverHashes: string[]): { start: number; end: number }[] {
  return buckets
    .filter((bucket, idx) => serverHashes[idx] !== bucket.hash)
    .map(bucket => ({ start: bucket.start, end: bucket.end }));
}

export async function diffEvents(kv: Deno.Kv, topic: string, req: EventDiffRequest): Promise<EventDiffResult | null> {
  const meta = await kv.get<StoredTopic>([...KV_TOPIC, topic]);
  if (!meta.value) return null;

  const bucketMap = await buildBucketMap(kv, topic, req.bucketSize);
  const serverHashes = await computeBucketHashes(bucketMap, req.buckets);
  const serverRoot = await hashBucketRoot(serverHashes);

  if (serverRoot === req.root) return { kind: "match" };

  return { kind: "diff", ranges: differingRanges(req.buckets, serverHashes) };
}

async function readEventsByIds(kv: Deno.Kv, topic: string, ids: number[]): Promise<EventEntry[]> {
  const results = await Promise.all(ids.map(id => kv.get<StoredEvent>([...KV_EVENT, topic, id])));
  return results.flatMap(item => item.value !== null ? [item.value] : []);
}

export async function readEvents(kv: Deno.Kv, topic: string, opts: ReadEventOptions): Promise<EventEntry[] | null> {
  const meta = await kv.get<StoredTopic>([...KV_TOPIC, topic]);
  if (!meta.value) {
    return null;
  }

  if (opts.ids !== undefined) {
    return readEventsByIds(kv, topic, opts.ids);
  }

  const prefix = [...KV_EVENT, topic];
  const selector = opts.start !== undefined
    ? { prefix, start: [...KV_EVENT, topic, opts.start] }
    : { prefix };

  const entries: EventEntry[] = [];
  for await (const item of kv.list<StoredEvent>(selector, { limit: opts.size })) {
    entries.push(item.value);
  }
  return entries;
}
