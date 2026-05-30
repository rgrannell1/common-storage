// Event write operations — writeEvent and updateEvent
// @work.md

import type { IStorageBackend, IAtomicWriter } from "../backend.ts";
import type { EventEntry, UpdateEventTimestamps, WriteFailure } from "../../capabilities.ts";
import type { StoredTopic, StoredTopicStats, StoredEvent } from "../types/stored-types.ts";
import { KV_TOPIC, KV_TOPIC_STATS, KV_EVENT, KV_EVENT_COUNTER, KV_MERKLE_HASH } from "../keys.ts";
import { MERKLE_LEAF_SIZE, MERKLE_TREE_END } from "../../../commons/constants.ts";
import { ok, err, type Result } from "../../../commons/types/result.ts";
import { payloadTooLarge } from "../payload-guard.ts";

// Returns the sequence of Merkle node ranges on the path from the leaf containing id to the root.
// Each ancestor's cached hash must be invalidated when id is written.
function merklePath(id: number): { start: number; end: number }[] {
  const path: { start: number; end: number }[] = [];
  let start = 0, end = MERKLE_TREE_END;
  while (end - start > MERKLE_LEAF_SIZE) {
    path.push({ start, end });
    const mid = Math.floor((start + end) / 2);
    if (id <= mid) { end = mid; } else { start = mid; }
  }
  path.push({ start, end }); // leaf
  return path;
}

// Adds Merkle cache invalidation deletes to the atomic writer for an event at id.
function invalidateMerklePath(atomic: IAtomicWriter, topic: string, id: number): IAtomicWriter {
  for (const node of merklePath(id)) {
    atomic = atomic.delete([...KV_MERKLE_HASH, topic, node.start, node.end]);
  }
  return atomic;
}

export async function writeEvent(
  storage: IStorageBackend,
  topic: string,
  payload: unknown,
): Promise<Result<EventEntry, WriteFailure>> {
  if (payloadTooLarge(payload)) return err({ kind: "payload_too_large" });

  const meta = await storage.get<StoredTopic>([...KV_TOPIC, topic]);
  if (!meta) return err({ kind: "topic_not_found" });

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

    let atomic = storage.atomic()
      .check(counter)
      .check(stats)
      .set([...KV_EVENT_COUNTER, topic], id)
      .set([...KV_EVENT, topic, id], entry)
      .set([...KV_TOPIC_STATS, topic], newStats);
    atomic = invalidateMerklePath(atomic, topic, id);

    const result = await atomic.commit();
    if (result.ok) return ok(entry);
  }
}

// Removes an event by ID, decrements the topic stats count, and invalidates
// the Merkle path. Used by the client-side relocate path when an optimistic
// write is moved to the server's ID.
export async function deleteEvent(
  storage: IStorageBackend,
  topic: string,
  id: number,
): Promise<void> {
  const meta = await storage.get<StoredTopic>([...KV_TOPIC, topic]);
  if (!meta) return;

  while (true) {
    const [existing, stats] = await Promise.all([
      storage.getEntry<StoredEvent>([...KV_EVENT, topic, id]),
      storage.getEntry<StoredTopicStats>([...KV_TOPIC_STATS, topic]),
    ]);
    if (existing.value === null) return;

    const newStats: StoredTopicStats = {
      count: Math.max(0, (stats.value?.count ?? 0) - 1),
      lastUpdated: Date.now(),
    };

    let atomic = storage.atomic()
      .check(existing)
      .check(stats)
      .delete([...KV_EVENT, topic, id])
      .set([...KV_TOPIC_STATS, topic], newStats);
    atomic = invalidateMerklePath(atomic, topic, id);

    const result = await atomic.commit();
    if (result.ok) return;
  }
}

export async function updateEvent(
  storage: IStorageBackend,
  topic: string,
  id: number,
  payload: unknown,
  timestamps?: UpdateEventTimestamps,
): Promise<Result<{ entry: EventEntry; created: boolean }, WriteFailure>> {
  if (payloadTooLarge(payload)) return err({ kind: "payload_too_large" });

  const meta = await storage.get<StoredTopic>([...KV_TOPIC, topic]);
  if (!meta) return err({ kind: "topic_not_found" });

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

    let atomic = storage.atomic()
      .check(existing)
      .check(stats)
      .set([...KV_EVENT, topic, id], entry)
      .set([...KV_TOPIC_STATS, topic], newStats);
    atomic = invalidateMerklePath(atomic, topic, id);

    if (isNew) {
      // Advance counter past this ID so future local writeEvent calls don't collide.
      const nextCounter = Math.max(counter.value ?? 0, id);
      atomic = atomic
        .check(counter)
        .set([...KV_EVENT_COUNTER, topic], nextCounter);
    }

    const result = await atomic.commit();
    if (result.ok) return ok({ entry, created: isNew });
  }
}
