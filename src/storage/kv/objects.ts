// Object topic read/write — implements IUpsertObject, IReadObject, IDeleteObject, IReadObjects, IReadObjectsBySeq, IStreamObjects, IDiffObjects
// @work.md

import type { IStorageBackend, IAtomicWriter } from "./backend.ts";
import type { ObjectEntry, ObjectDiffRequest, ObjectDiffResult, EventDiffBucket } from "../capabilities.ts";
import { hashBucket, hashBucketRoot, bucketStartFor } from "../../core/hashing.ts";
import { waitForPoll } from "./base.ts";
import type { StoredTopic, StoredTopicStats, StoredObject } from "./types/stored-types.ts";
import { KV_TOPIC, KV_TOPIC_STATS, KV_OBJECT, KV_OBJECT_SEQ, KV_OBJECT_COUNTER, KV_BUCKET_HASH, KV_BUCKET_INDEX, KV_TOPIC_ROOT_HASH } from "./keys.ts";
import { TOMBSTONE_RETENTION_MS, DEFAULT_OBJECT_BUCKET_SIZE } from "../../commons/constants.ts";

type BucketEntry = { id: number; updatedAt: number };

function byIdAscending(first: BucketEntry, second: BucketEntry): number {
  return first.id - second.id;
}

// Scans the seq index within one bucket's range and hashes the entries.
async function computeObjectBucketHashFromRange(storage: IStorageBackend, topic: string, bucketStart: number): Promise<string> {
  const entries: BucketEntry[] = [];
  for await (const item of storage.list<StoredObject>({
    start: [...KV_OBJECT_SEQ, topic, bucketStart + 1],
    end: [...KV_OBJECT_SEQ, topic, bucketStart + DEFAULT_OBJECT_BUCKET_SIZE + 1],
  })) {
    const seq = item.key[item.key.length - 1] as number;
    entries.push({ id: seq, updatedAt: item.value.updatedAt });
  }
  return hashBucket(entries.sort(byIdAscending));
}

// Returns the cached bucket hash, computing and caching it on a miss.
async function getCachedOrComputeBucketHash(storage: IStorageBackend, topic: string, bucketStart: number): Promise<string> {
  const cacheKey = [...KV_BUCKET_HASH, topic, DEFAULT_OBJECT_BUCKET_SIZE, bucketStart];
  const cached = await storage.get<string>(cacheKey);
  if (cached !== null) return cached;
  const hash = await computeObjectBucketHashFromRange(storage, topic, bucketStart);
  await storage.set(cacheKey, hash);
  return hash;
}

// Computes server hashes for every client bucket and identifies which differ.
async function computeClientBucketDiffs(
  storage: IStorageBackend,
  topic: string,
  buckets: EventDiffBucket[],
): Promise<{ differingRanges: { start: number; end: number }[] }> {
  const serverHashes = await Promise.all(
    buckets.map(bucket => getCachedOrComputeBucketHash(storage, topic, bucket.start)),
  );
  const differingRanges = buckets
    .filter((bucket, idx) => serverHashes[idx] !== bucket.hash)
    .map(bucket => ({ start: bucket.start, end: bucket.end }));
  return { differingRanges };
}

// Returns seq bucket starts on the server that the client did not include.
async function serverOnlyBucketStarts(storage: IStorageBackend, topic: string, clientBuckets: EventDiffBucket[]): Promise<number[]> {
  const clientStarts = new Set(clientBuckets.map(bucket => bucket.start));
  const result: number[] = [];
  for await (const item of storage.list<1>({ prefix: [...KV_BUCKET_INDEX, topic, DEFAULT_OBJECT_BUCKET_SIZE] })) {
    const start = item.key[item.key.length - 1] as number;
    if (!clientStarts.has(start)) result.push(start);
  }
  return result;
}

// Invalidates bucket hash caches for the given seq positions and updates the bucket existence index.
function invalidateBuckets(
  atomic: IAtomicWriter,
  topic: string,
  newSeq: number,
  oldSeq: number | undefined,
): IAtomicWriter {
  const newBucketStart = bucketStartFor(newSeq, DEFAULT_OBJECT_BUCKET_SIZE);
  atomic = atomic
    .delete([...KV_BUCKET_HASH, topic, DEFAULT_OBJECT_BUCKET_SIZE, newBucketStart])
    .set([...KV_BUCKET_INDEX, topic, DEFAULT_OBJECT_BUCKET_SIZE, newBucketStart], 1)
    .delete([...KV_TOPIC_ROOT_HASH, topic, DEFAULT_OBJECT_BUCKET_SIZE]);

  if (oldSeq !== undefined) {
    const oldBucketStart = bucketStartFor(oldSeq, DEFAULT_OBJECT_BUCKET_SIZE);
    if (oldBucketStart !== newBucketStart) {
      atomic = atomic.delete([...KV_BUCKET_HASH, topic, DEFAULT_OBJECT_BUCKET_SIZE, oldBucketStart]);
    }
  }
  return atomic;
}

export async function upsertObject(
  storage: IStorageBackend,
  topic: string,
  id: string,
  payload: unknown,
  timestamps?: { createdAt?: number; updatedAt?: number; seq?: number },
): Promise<ObjectEntry | null> {
  const meta = await storage.get<StoredTopic>([...KV_TOPIC, topic]);
  if (!meta) return null;

  while (true) {
    const [existing, stats, counter] = await Promise.all([
      storage.getEntry<StoredObject>([...KV_OBJECT, topic, id]),
      storage.getEntry<StoredTopicStats>([...KV_TOPIC_STATS, topic]),
      storage.getEntry<number>([...KV_OBJECT_COUNTER, topic]),
    ]);
    const now = Date.now();
    const isNew = existing.value === null;
    // Use remote seq when provided (sync replication); advance counter to max so local
    // writes after a replication still produce strictly higher seq values.
    const newSeq = timestamps?.seq ?? (counter.value ?? 0) + 1;
    const newCounter = Math.max(counter.value ?? 0, newSeq);
    const oldSeq = existing.value?.seq;

    const entry: StoredObject = {
      id,
      seq: newSeq,
      createdAt: timestamps?.createdAt ?? existing.value?.createdAt ?? now,
      updatedAt: timestamps?.updatedAt ?? now,
      payload,
    };
    const newStats: StoredTopicStats = {
      count: (stats.value?.count ?? 0) + (isNew ? 1 : 0),
      lastUpdated: now,
    };

    let atomic = storage.atomic()
      .check(existing)
      .check(stats)
      .check(counter)
      .set([...KV_OBJECT, topic, id], entry)
      .set([...KV_OBJECT_SEQ, topic, newSeq], entry)
      .set([...KV_OBJECT_COUNTER, topic], newCounter)
      .set([...KV_TOPIC_STATS, topic], newStats);

    // Only delete the old seq slot when it differs from newSeq; deleting the same key
    // that was just set in the same atomic would remove the entry we just wrote.
    if (oldSeq !== undefined && oldSeq !== newSeq) {
      atomic = atomic.delete([...KV_OBJECT_SEQ, topic, oldSeq]);
    }
    atomic = invalidateBuckets(atomic, topic, newSeq, oldSeq);

    const result = await atomic.commit();
    if (result.ok) return entry;
  }
}

export async function deleteObject(
  storage: IStorageBackend,
  topic: string,
  id: string,
  timestamps?: { createdAt?: number; updatedAt?: number; seq?: number },
): Promise<ObjectEntry | null> {
  const meta = await storage.get<StoredTopic>([...KV_TOPIC, topic]);
  if (!meta) return null;

  while (true) {
    const [existing, stats, counter] = await Promise.all([
      storage.getEntry<StoredObject>([...KV_OBJECT, topic, id]),
      storage.getEntry<StoredTopicStats>([...KV_TOPIC_STATS, topic]),
      storage.getEntry<number>([...KV_OBJECT_COUNTER, topic]),
    ]);
    const now = Date.now();
    const newSeq = timestamps?.seq ?? (counter.value ?? 0) + 1;
    const newCounter = Math.max(counter.value ?? 0, newSeq);
    const oldSeq = existing.value?.seq;

    const tombstone: StoredObject = {
      id,
      seq: newSeq,
      createdAt: timestamps?.createdAt ?? existing.value?.createdAt ?? now,
      updatedAt: timestamps?.updatedAt ?? now,
      payload: null,
    };
    const newStats: StoredTopicStats = {
      // Deletion does not reduce the count — tombstones are still entries
      count: stats.value?.count ?? 0,
      lastUpdated: now,
    };

    let atomic = storage.atomic()
      .check(existing)
      .check(stats)
      .check(counter)
      .set([...KV_OBJECT, topic, id], tombstone)
      .set([...KV_OBJECT_SEQ, topic, newSeq], tombstone)
      .set([...KV_OBJECT_COUNTER, topic], newCounter)
      .set([...KV_TOPIC_STATS, topic], newStats);

    if (oldSeq !== undefined && oldSeq !== newSeq) {
      atomic = atomic.delete([...KV_OBJECT_SEQ, topic, oldSeq]);
    }
    atomic = invalidateBuckets(atomic, topic, newSeq, oldSeq);

    const result = await atomic.commit();
    if (result.ok) return tombstone;
  }
}

// Rolls over all bucket hashes to compute and cache the topic root hash.
async function getOrComputeRootHash(storage: IStorageBackend, topic: string): Promise<string> {
  const cacheKey = [...KV_TOPIC_ROOT_HASH, topic, DEFAULT_OBJECT_BUCKET_SIZE];
  const cached = await storage.get<string>(cacheKey);
  if (cached !== null) return cached;

  const bucketStarts: number[] = [];
  for await (const item of storage.list<1>({ prefix: [...KV_BUCKET_INDEX, topic, DEFAULT_OBJECT_BUCKET_SIZE] })) {
    bucketStarts.push(item.key[item.key.length - 1] as number);
  }
  bucketStarts.sort((first, second) => first - second);

  const bucketHashes = await Promise.all(bucketStarts.map(start => getCachedOrComputeBucketHash(storage, topic, start)));
  const root = await hashBucketRoot(bucketHashes);
  await storage.set(cacheKey, root);
  return root;
}

export async function diffObjects(storage: IStorageBackend, topic: string, req: ObjectDiffRequest): Promise<ObjectDiffResult | null> {
  const meta = await storage.get([...KV_TOPIC, topic]);
  if (!meta) return null;

  const serverRoot = await getOrComputeRootHash(storage, topic);
  if (serverRoot === req.root) return { kind: "match" };

  const { differingRanges } = await computeClientBucketDiffs(storage, topic, req.buckets);
  const uncoveredStarts = await serverOnlyBucketStarts(storage, topic, req.buckets);
  const serverOnlyRanges = uncoveredStarts.map(start => ({ start, end: start + DEFAULT_OBJECT_BUCKET_SIZE }));

  if (differingRanges.length === 0 && serverOnlyRanges.length === 0) return { kind: "match" };
  return { kind: "diff", ranges: [...differingRanges, ...serverOnlyRanges] };
}

export async function* streamObjects(storage: IStorageBackend, topic: string, startSeq: number, signal: AbortSignal): AsyncGenerator<ObjectEntry> {
  const meta = await storage.get<StoredTopic>([...KV_TOPIC, topic]);
  if (!meta) return;

  let nextSeq = startSeq;

  while (!signal.aborted) {
    const prefix = [...KV_OBJECT_SEQ, topic];
    const selector = nextSeq > 1
      ? { prefix, start: [...KV_OBJECT_SEQ, topic, nextSeq] }
      : { prefix };

    let yieldedAny = false;
    for await (const item of storage.list<StoredObject>(selector)) {
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

export async function readObjects(storage: IStorageBackend, topic: string): Promise<ObjectEntry[] | null> {
  const meta = await storage.get<StoredTopic>([...KV_TOPIC, topic]);
  if (!meta) return null;

  const entries: ObjectEntry[] = [];
  for await (const item of storage.list<StoredObject>({ prefix: [...KV_OBJECT, topic] })) {
    entries.push(item.value);
  }
  return entries;
}

export async function readObjectsBySeq(storage: IStorageBackend, topic: string, opts: { start?: number; size?: number }): Promise<ObjectEntry[] | null> {
  const meta = await storage.get<StoredTopic>([...KV_TOPIC, topic]);
  if (!meta) return null;

  const prefix = [...KV_OBJECT_SEQ, topic];
  const selector = opts.start !== undefined
    ? { prefix, start: [...KV_OBJECT_SEQ, topic, opts.start] }
    : { prefix };
  const limit = opts.size !== undefined ? { limit: opts.size } : {};

  const entries: ObjectEntry[] = [];
  for await (const item of storage.list<StoredObject>(selector, limit)) {
    entries.push(item.value);
  }
  return entries;
}

export async function readObject(storage: IStorageBackend, topic: string, id: string): Promise<ObjectEntry | null> {
  const meta = await storage.get<StoredTopic>([...KV_TOPIC, topic]);
  if (!meta) return null;

  return storage.get<StoredObject>([...KV_OBJECT, topic, id]);
}

// Deletes tombstones (payload: null) older than cutoff. Uses .check() on each entry so a
// concurrent resurrection (upsert after delete) causes the atomic to fail safely — the entry
// is no longer a tombstone and should not be swept. Also invalidates the bucket hash cache so
// the next diff recomputes the bucket rather than returning a stale match. After a successful
// sweep, if the bucket is now empty its KV_BUCKET_INDEX entry is removed so serverOnlyBucketStarts
// does not permanently report the emptied bucket as divergent on every subsequent diff.
export async function sweepTombstones(storage: IStorageBackend, topic: string, cutoff?: number): Promise<void> {
  const effectiveCutoff = cutoff ?? Date.now() - TOMBSTONE_RETENTION_MS;
  for await (const item of storage.list<StoredObject>({ prefix: [...KV_OBJECT, topic] })) {
    if (item.value.payload === null && item.value.updatedAt < effectiveCutoff) {
      const bucketStart = bucketStartFor(item.value.seq, DEFAULT_OBJECT_BUCKET_SIZE);
      const result = await storage.atomic()
        .check(item)
        .delete(item.key)
        .delete([...KV_OBJECT_SEQ, topic, item.value.seq])
        .delete([...KV_BUCKET_HASH, topic, DEFAULT_OBJECT_BUCKET_SIZE, bucketStart])
        .delete([...KV_TOPIC_ROOT_HASH, topic, DEFAULT_OBJECT_BUCKET_SIZE])
        .commit();

      // { ok: false } means a concurrent upsert replaced the tombstone — skip it safely.
      if (!result.ok) continue;

      // If the bucket is now empty, remove its index entry so it no longer appears as server-only
      // in future diffs. A limit:1 scan is sufficient — any entry means the bucket is non-empty.
      // +1 because Deno KV end is exclusive; bucket covers bucketStart+1..bucketStart+size inclusive.
      const bucketEnd = bucketStart + DEFAULT_OBJECT_BUCKET_SIZE + 1;
      let bucketEmpty = true;
      for await (const _ of storage.list<StoredObject>({
        start: [...KV_OBJECT_SEQ, topic, bucketStart],
        end: [...KV_OBJECT_SEQ, topic, bucketEnd],
      }, { limit: 1 })) {
        bucketEmpty = false;
      }
      if (bucketEmpty) {
        await storage.delete([...KV_BUCKET_INDEX, topic, DEFAULT_OBJECT_BUCKET_SIZE, bucketStart]);
      }
    }
  }
}
