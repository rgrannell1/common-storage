// Event write operations — writeEvent and updateEvent
// @work.md

import type { IStorageBackend } from "../../backend.ts";
import type { EventEntry, UpdateEventTimestamps } from "../../capabilities.ts";
import type { StoredTopic, StoredTopicStats, StoredEvent } from "../../types/stored-types.ts";
import { KV_TOPIC, KV_TOPIC_STATS, KV_EVENT, KV_EVENT_COUNTER, KV_BUCKET_HASH, KV_BUCKET_INDEX, KV_TOPIC_ROOT_HASH } from "../../keys.ts";
import { DEFAULT_EVENT_BUCKET_SIZE } from "../../../../commons/constants.ts";
import { bucketStartFor } from "../hashing.ts";

export async function writeEvent(storage: IStorageBackend, topic: string, payload: unknown): Promise<EventEntry | null> {
  const meta = await storage.get<StoredTopic>([...KV_TOPIC, topic]);
  if (!meta) return null;

  // Atomically claim the next ID by checking the counter versionstamp and retrying on conflict.
  while (true) {
    const [counter, stats] = await Promise.all([
      storage.getEntry<number>([...KV_EVENT_COUNTER, topic]),
      storage.getEntry<StoredTopicStats>([...KV_TOPIC_STATS, topic]),
    ]);
    const id = (counter.value ?? 0) + 1;
    const now = Date.now();

    const entry: StoredEvent = { id, createdAt: now, updatedAt: now, payload };
    const newStats: StoredTopicStats = { count: (stats.value?.count ?? 0) + 1, lastUpdated: now };
    const bucketStart = bucketStartFor(id, DEFAULT_EVENT_BUCKET_SIZE);

    const result = await storage.atomic()
      .check(counter)
      .check(stats)
      .set([...KV_EVENT_COUNTER, topic], id)
      .set([...KV_EVENT, topic, id], entry)
      .set([...KV_TOPIC_STATS, topic], newStats)
      .delete([...KV_BUCKET_HASH, topic, DEFAULT_EVENT_BUCKET_SIZE, bucketStart])
      .set([...KV_BUCKET_INDEX, topic, DEFAULT_EVENT_BUCKET_SIZE, bucketStart], 1)
      .delete([...KV_TOPIC_ROOT_HASH, topic, DEFAULT_EVENT_BUCKET_SIZE])
      .commit();

    if (result.ok) return entry;
  }
}

export async function updateEvent(storage: IStorageBackend, topic: string, id: number, payload: unknown, timestamps?: UpdateEventTimestamps): Promise<{ entry: EventEntry; created: boolean } | null> {
  const meta = await storage.get<StoredTopic>([...KV_TOPIC, topic]);
  if (!meta) return null;

  while (true) {
    const [existing, stats, counter] = await Promise.all([
      storage.getEntry<StoredEvent>([...KV_EVENT, topic, id]),
      storage.getEntry<StoredTopicStats>([...KV_TOPIC_STATS, topic]),
      storage.getEntry<number>([...KV_EVENT_COUNTER, topic]),
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
    const bucketStart = bucketStartFor(id, DEFAULT_EVENT_BUCKET_SIZE);

    let atomic = storage.atomic()
      .check(existing)
      .check(stats)
      .set([...KV_EVENT, topic, id], entry)
      .set([...KV_TOPIC_STATS, topic], newStats)
      .delete([...KV_BUCKET_HASH, topic, DEFAULT_EVENT_BUCKET_SIZE, bucketStart])
      .set([...KV_BUCKET_INDEX, topic, DEFAULT_EVENT_BUCKET_SIZE, bucketStart], 1)
      .delete([...KV_TOPIC_ROOT_HASH, topic, DEFAULT_EVENT_BUCKET_SIZE]);

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
