// Event write operations — writeEvent and updateEvent
// @work.md

import type { EventEntry, UpdateEventTimestamps } from "../../capabilities.ts";
import type { StoredTopic, StoredTopicStats, StoredEvent } from "../../types/stored-types.ts";
import { KV_TOPIC, KV_TOPIC_STATS, KV_EVENT, KV_EVENT_COUNTER } from "../../keys.ts";

export async function writeEvent(kv: Deno.Kv, topic: string, payload: unknown): Promise<EventEntry | null> {
  const meta = await kv.get<StoredTopic>([...KV_TOPIC, topic]);
  if (!meta.value) {
    return null;
  }

  // Atomically claim the next ID by checking the counter versionstamp and retrying on conflict.
  while (true) {
    const [counter, stats] = await Promise.all([
      kv.get<number>([...KV_EVENT_COUNTER, topic]),
      kv.get<StoredTopicStats>([...KV_TOPIC_STATS, topic]),
    ]);
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

export async function updateEvent(kv: Deno.Kv, topic: string, id: number, payload: unknown, timestamps?: UpdateEventTimestamps): Promise<{ entry: EventEntry; created: boolean } | null> {
  const meta = await kv.get<StoredTopic>([...KV_TOPIC, topic]);
  if (!meta.value) return null;

  while (true) {
    const [existing, stats, counter] = await Promise.all([
      kv.get<StoredEvent>([...KV_EVENT, topic, id]),
      kv.get<StoredTopicStats>([...KV_TOPIC_STATS, topic]),
      kv.get<number>([...KV_EVENT_COUNTER, topic]),
    ]);

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
