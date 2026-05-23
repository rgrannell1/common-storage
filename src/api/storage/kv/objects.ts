// Object topic read/write — implements IUpsertObject, IReadObject, IDeleteObject, IReadObjects, IReadObjectsBySeq, IStreamObjects, IDiffObjects
// @work.md

import type { ObjectEntry, ObjectDiffRequest, ObjectDiffResult, EventDiffBucket } from "../capabilities.ts";
import { hashBucket, hashBucketRoot, bucketStartFor } from "./hashing.ts";
import { waitForPoll } from "./base.ts";
import type { StoredTopic, StoredTopicStats, StoredObject } from "../types/stored-types.ts";
import { KV_TOPIC, KV_TOPIC_STATS, KV_OBJECT, KV_OBJECT_SEQ, KV_OBJECT_COUNTER, KV_BUCKET_HASH, KV_BUCKET_INDEX } from "../keys.ts";
import { TOMBSTONE_RETENTION_MS, DEFAULT_OBJECT_BUCKET_SIZE, DEFAULT_PAGE_SIZE } from "../../../commons/constants.ts";

type BucketEntry = { id: number; updatedAt: number };

function byIdAscending(first: BucketEntry, second: BucketEntry): number {
  return first.id - second.id;
}

// Scans the seq index within one bucket's range and hashes the entries.
async function computeObjectBucketHashFromRange(kv: Deno.Kv, topic: string, bucketStart: number): Promise<string> {
  const entries: BucketEntry[] = [];
  for await (const item of kv.list<StoredObject>({
    start: [...KV_OBJECT_SEQ, topic, bucketStart + 1],
    end: [...KV_OBJECT_SEQ, topic, bucketStart + DEFAULT_OBJECT_BUCKET_SIZE + 1],
  })) {
    const seq = item.key[item.key.length - 1] as number;
    entries.push({ id: seq, updatedAt: item.value.updatedAt });
  }
  return hashBucket(entries.sort(byIdAscending));
}

// Returns the cached bucket hash, computing and caching it on a miss.
async function getCachedOrComputeBucketHash(kv: Deno.Kv, topic: string, bucketStart: number): Promise<string> {
  const cacheKey = [...KV_BUCKET_HASH, topic, DEFAULT_OBJECT_BUCKET_SIZE, bucketStart];
  const cached = await kv.get<string>(cacheKey);
  if (cached.value !== null) return cached.value;
  const hash = await computeObjectBucketHashFromRange(kv, topic, bucketStart);
  await kv.set(cacheKey, hash);
  return hash;
}

// Computes server hashes for every client bucket and identifies which differ.
async function computeClientBucketDiffs(
  kv: Deno.Kv,
  topic: string,
  buckets: EventDiffBucket[],
): Promise<{ serverHashes: string[]; differingRanges: { start: number; end: number }[] }> {
  const serverHashes = await Promise.all(
    buckets.map(bucket => getCachedOrComputeBucketHash(kv, topic, bucket.start)),
  );
  const differingRanges = buckets
    .filter((bucket, idx) => serverHashes[idx] !== bucket.hash)
    .map(bucket => ({ start: bucket.start, end: bucket.end }));
  return { serverHashes, differingRanges };
}

// Returns seq bucket starts on the server that the client did not include.
async function serverOnlyBucketStarts(kv: Deno.Kv, topic: string, clientBuckets: EventDiffBucket[]): Promise<number[]> {
  const clientStarts = new Set(clientBuckets.map(bucket => bucket.start));
  const result: number[] = [];
  for await (const item of kv.list<1>({ prefix: [...KV_BUCKET_INDEX, topic, DEFAULT_OBJECT_BUCKET_SIZE] })) {
    const start = item.key[item.key.length - 1] as number;
    if (!clientStarts.has(start)) result.push(start);
  }
  return result;
}

// Invalidates bucket hash caches for the given seq positions and updates the bucket existence index.
function invalidateBuckets(
  atomic: Deno.AtomicOperation,
  topic: string,
  newSeq: number,
  oldSeq: number | undefined,
): Deno.AtomicOperation {
  const newBucketStart = bucketStartFor(newSeq, DEFAULT_OBJECT_BUCKET_SIZE);
  atomic = atomic
    .delete([...KV_BUCKET_HASH, topic, DEFAULT_OBJECT_BUCKET_SIZE, newBucketStart])
    .set([...KV_BUCKET_INDEX, topic, DEFAULT_OBJECT_BUCKET_SIZE, newBucketStart], 1);

  if (oldSeq !== undefined) {
    const oldBucketStart = bucketStartFor(oldSeq, DEFAULT_OBJECT_BUCKET_SIZE);
    if (oldBucketStart !== newBucketStart) {
      atomic = atomic.delete([...KV_BUCKET_HASH, topic, DEFAULT_OBJECT_BUCKET_SIZE, oldBucketStart]);
    }
  }
  return atomic;
}

export async function upsertObject(kv: Deno.Kv, topic: string, id: string, payload: unknown): Promise<ObjectEntry | null> {
  const meta = await kv.get<StoredTopic>([...KV_TOPIC, topic]);
  if (!meta.value) return null;

  while (true) {
    const [existing, stats, counter] = await Promise.all([
      kv.get<StoredObject>([...KV_OBJECT, topic, id]),
      kv.get<StoredTopicStats>([...KV_TOPIC_STATS, topic]),
      kv.get<number>([...KV_OBJECT_COUNTER, topic]),
    ]);
    const now = Date.now();
    const isNew = existing.value === null;
    const newSeq = (counter.value ?? 0) + 1;
    const oldSeq = existing.value?.seq;

    const entry: StoredObject = {
      id,
      seq: newSeq,
      createdAt: existing.value?.createdAt ?? now,
      updatedAt: now,
      payload,
    };
    const newStats: StoredTopicStats = {
      count: (stats.value?.count ?? 0) + (isNew ? 1 : 0),
      lastUpdated: now,
    };

    let atomic = kv.atomic()
      .check(existing)
      .check(stats)
      .check(counter)
      .set([...KV_OBJECT, topic, id], entry)
      .set([...KV_OBJECT_SEQ, topic, newSeq], entry)
      .set([...KV_OBJECT_COUNTER, topic], newSeq)
      .set([...KV_TOPIC_STATS, topic], newStats);

    if (oldSeq !== undefined) {
      atomic = atomic.delete([...KV_OBJECT_SEQ, topic, oldSeq]);
    }
    atomic = invalidateBuckets(atomic, topic, newSeq, oldSeq);

    const result = await atomic.commit();
    if (result.ok) return entry;
  }
}

export async function deleteObject(kv: Deno.Kv, topic: string, id: string): Promise<ObjectEntry | null> {
  const meta = await kv.get<StoredTopic>([...KV_TOPIC, topic]);
  if (!meta.value) return null;

  while (true) {
    const [existing, stats, counter] = await Promise.all([
      kv.get<StoredObject>([...KV_OBJECT, topic, id]),
      kv.get<StoredTopicStats>([...KV_TOPIC_STATS, topic]),
      kv.get<number>([...KV_OBJECT_COUNTER, topic]),
    ]);
    const now = Date.now();
    const newSeq = (counter.value ?? 0) + 1;
    const oldSeq = existing.value?.seq;

    const tombstone: StoredObject = {
      id,
      seq: newSeq,
      createdAt: existing.value?.createdAt ?? now,
      updatedAt: now,
      payload: null,
    };
    const newStats: StoredTopicStats = {
      // Deletion does not reduce the count — tombstones are still entries
      count: stats.value?.count ?? 0,
      lastUpdated: now,
    };

    let atomic = kv.atomic()
      .check(existing)
      .check(stats)
      .check(counter)
      .set([...KV_OBJECT, topic, id], tombstone)
      .set([...KV_OBJECT_SEQ, topic, newSeq], tombstone)
      .set([...KV_OBJECT_COUNTER, topic], newSeq)
      .set([...KV_TOPIC_STATS, topic], newStats);

    if (oldSeq !== undefined) {
      atomic = atomic.delete([...KV_OBJECT_SEQ, topic, oldSeq]);
    }
    atomic = invalidateBuckets(atomic, topic, newSeq, oldSeq);

    const result = await atomic.commit();
    if (result.ok) return tombstone;
  }
}

export async function diffObjects(kv: Deno.Kv, topic: string, req: ObjectDiffRequest): Promise<ObjectDiffResult | null> {
  const meta = await kv.get([...KV_TOPIC, topic]);
  if (!meta.value) return null;

  const { serverHashes, differingRanges } = await computeClientBucketDiffs(kv, topic, req.buckets);
  const serverRoot = await hashBucketRoot(serverHashes);

  const uncoveredStarts = await serverOnlyBucketStarts(kv, topic, req.buckets);
  const serverOnlyRanges = uncoveredStarts.map(start => ({ start, end: start + DEFAULT_OBJECT_BUCKET_SIZE }));

  if (serverRoot === req.root && serverOnlyRanges.length === 0) return { kind: "match" };
  return { kind: "diff", ranges: [...differingRanges, ...serverOnlyRanges] };
}

export async function* streamObjects(kv: Deno.Kv, topic: string, startSeq: number, signal: AbortSignal): AsyncGenerator<ObjectEntry> {
  const meta = await kv.get<StoredTopic>([...KV_TOPIC, topic]);
  if (!meta.value) return;

  let nextSeq = startSeq;

  while (!signal.aborted) {
    const prefix = [...KV_OBJECT_SEQ, topic];
    const selector = nextSeq > 1
      ? { prefix, start: [...KV_OBJECT_SEQ, topic, nextSeq] }
      : { prefix };

    let yieldedAny = false;
    for await (const item of kv.list<StoredObject>(selector)) {
      if (signal.aborted) return;
      const seq = item.key[item.key.length - 1] as number;
      yield item.value;
      nextSeq = seq + 1;
      yieldedAny = true;
    }

    if (!yieldedAny) {
      await waitForPoll(signal);
    }
  }
}

export async function readObjects(kv: Deno.Kv, topic: string): Promise<ObjectEntry[] | null> {
  const meta = await kv.get<StoredTopic>([...KV_TOPIC, topic]);
  if (!meta.value) return null;

  const entries: ObjectEntry[] = [];
  for await (const item of kv.list<StoredObject>({ prefix: [...KV_OBJECT, topic] })) {
    entries.push(item.value);
  }
  return entries;
}

export async function readObjectsBySeq(kv: Deno.Kv, topic: string, opts: { start?: number; size?: number }): Promise<ObjectEntry[] | null> {
  const meta = await kv.get<StoredTopic>([...KV_TOPIC, topic]);
  if (!meta.value) return null;

  const limit = opts.size ?? DEFAULT_PAGE_SIZE;
  const prefix = [...KV_OBJECT_SEQ, topic];
  const selector = opts.start !== undefined
    ? { prefix, start: [...KV_OBJECT_SEQ, topic, opts.start] }
    : { prefix };

  const entries: ObjectEntry[] = [];
  for await (const item of kv.list<StoredObject>(selector, { limit })) {
    entries.push(item.value);
  }
  return entries;
}

export async function readObject(kv: Deno.Kv, topic: string, id: string): Promise<ObjectEntry | null> {
  const meta = await kv.get<StoredTopic>([...KV_TOPIC, topic]);
  if (!meta.value) return null;

  const entry = await kv.get<StoredObject>([...KV_OBJECT, topic, id]);
  if (!entry.value) return null;

  return entry.value;
}

// Deletes tombstones (payload: null) older than cutoff. Uses .check() on each entry so a
// concurrent resurrection (upsert after delete) causes the atomic to fail safely — the entry
// is no longer a tombstone and should not be swept. Also invalidates the bucket hash cache so
// the next diff recomputes the bucket rather than returning a stale match.
export async function sweepTombstones(kv: Deno.Kv, topic: string, cutoff?: number): Promise<void> {
  const effectiveCutoff = cutoff ?? Date.now() - TOMBSTONE_RETENTION_MS;
  for await (const item of kv.list<StoredObject>({ prefix: [...KV_OBJECT, topic] })) {
    if (item.value.payload === null && item.value.updatedAt < effectiveCutoff) {
      const bucketStart = bucketStartFor(item.value.seq, DEFAULT_OBJECT_BUCKET_SIZE);
      await kv.atomic()
        .check(item)
        .delete(item.key)
        .delete([...KV_OBJECT_SEQ, topic, item.value.seq])
        .delete([...KV_BUCKET_HASH, topic, DEFAULT_OBJECT_BUCKET_SIZE, bucketStart])
        .commit();
      // If the check fails a concurrent upsert replaced the tombstone — skip it safely.
    }
  }
}
