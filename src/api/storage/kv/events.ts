// Event topic read/write — implements IWriteEvent, IReadEvents, IReadEvent, IUpdateEvent
// @work.md

import type { EventEntry, ReadEventOptions } from "../capabilities.ts";
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

export async function updateEvent(kv: Deno.Kv, topic: string, id: number, payload: unknown): Promise<EventEntry | null> {
  const meta = await kv.get<StoredTopic>([...KV_TOPIC, topic]);
  if (!meta.value) {
    return null;
  }

  while (true) {
    const existing = await kv.get<StoredEvent>([...KV_EVENT, topic, id]);
    if (!existing.value) {
      return null;
    }
    const stats = await kv.get<StoredTopicStats>([...KV_TOPIC_STATS, topic]);

    const now = Date.now();
    const updated: StoredEvent = { ...existing.value, updatedAt: now, payload };
    const newStats: StoredTopicStats = { count: stats.value?.count ?? 0, lastUpdated: now };

    const result = await kv.atomic()
      .check(existing)
      .check(stats)
      .set([...KV_EVENT, topic, id], updated)
      .set([...KV_TOPIC_STATS, topic], newStats)
      .commit();

    if (result.ok) {
      return updated;
    }
  }
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
