// Object topic read/write — implements IUpsertObject, IReadObject, IDeleteObject, IReadObjects, IReadObjectsBySeq, IStreamObjects, IDiffObjects
// @work.md

import type { IStorageBackend, IAtomicWriter } from "./backend.ts";
import type { ObjectEntry, MerkleDiffRequest, ObjectDiffResponse, MerkleMismatch } from "../capabilities.ts";
import { hashBucket, hashMerkleInternalNode } from "../../core/hashing.ts";
import { waitForPoll } from "./base.ts";
import type { StoredTopic, StoredTopicStats, StoredObject } from "./types/stored-types.ts";
import { KV_TOPIC, KV_TOPIC_STATS, KV_OBJECT, KV_OBJECT_SEQ, KV_OBJECT_COUNTER, KV_MERKLE_HASH } from "./keys.ts";
import { TOMBSTONE_RETENTION_MS, MERKLE_LEAF_SIZE, MERKLE_TREE_END, MERKLE_TREE_DEPTH } from "../../commons/constants.ts";

type BucketEntry = { id: number; updatedAt: number };

function byIdAscending(first: BucketEntry, second: BucketEntry): number {
  return first.id - second.id;
}

// Returns the Merkle path from the leaf containing seq to the root — all nodes to invalidate on write.
function merklePath(seq: number): { start: number; end: number }[] {
  const path: { start: number; end: number }[] = [];
  let start = 0, end = MERKLE_TREE_END;
  while (end - start > MERKLE_LEAF_SIZE) {
    path.push({ start, end });
    const mid = Math.floor((start + end) / 2);
    if (seq <= mid) { end = mid; } else { start = mid; }
  }
  path.push({ start, end }); // leaf
  return path;
}

// Adds Merkle cache invalidation deletes for all nodes on seq's path to root.
function invalidateMerklePath(atomic: IAtomicWriter, topic: string, seq: number): IAtomicWriter {
  for (const node of merklePath(seq)) {
    atomic = atomic.delete([...KV_MERKLE_HASH, topic, node.start, node.end]);
  }
  return atomic;
}

// When seq changes (object update), both old and new seq paths must be invalidated.
function invalidateMerklePaths(atomic: IAtomicWriter, topic: string, newSeq: number, oldSeq: number | undefined): IAtomicWriter {
  atomic = invalidateMerklePath(atomic, topic, newSeq);
  if (oldSeq !== undefined && oldSeq !== newSeq) {
    atomic = invalidateMerklePath(atomic, topic, oldSeq);
  }
  return atomic;
}

// Pre-computed hashes for empty subtrees at each depth (0 = leaf, MERKLE_TREE_DEPTH = root).
// Initialised once per process; subsequent callers share the same Promise.
let emptyHashTablePromise: Promise<string[]> | null = null;

function getEmptyHashTable(): Promise<string[]> {
  if (emptyHashTablePromise === null) {
    emptyHashTablePromise = buildEmptyHashTable();
  }
  return emptyHashTablePromise;
}

async function buildEmptyHashTable(): Promise<string[]> {
  const hashes: string[] = [await hashBucket([])];
  for (let idx = 1; idx <= MERKLE_TREE_DEPTH; idx++) {
    hashes.push(await hashMerkleInternalNode(hashes[idx - 1], hashes[idx - 1]));
  }
  return hashes;
}

// Checks whether the seq range (start, end] is empty.
async function isObjectRangeEmpty(storage: IStorageBackend, topic: string, start: number, end: number): Promise<boolean> {
  for await (const _ of storage.list<StoredObject>({
    start: [...KV_OBJECT_SEQ, topic, start + 1],
    end: [...KV_OBJECT_SEQ, topic, end + 1],
  }, { limit: 1 })) {
    return false;
  }
  return true;
}

// Scans seq index entries in (start, end] and hashes them.
async function computeLeafHash(storage: IStorageBackend, topic: string, start: number, end: number): Promise<string> {
  const entries: BucketEntry[] = [];
  for await (const item of storage.list<StoredObject>({
    start: [...KV_OBJECT_SEQ, topic, start + 1],
    end: [...KV_OBJECT_SEQ, topic, end + 1],
  })) {
    entries.push({ id: item.value.seq, updatedAt: item.value.updatedAt });
  }
  return hashBucket(entries.sort(byIdAscending));
}

// Returns the cached hash for a Merkle node over the seq dimension, computing and caching on a miss.
// Uses sequential child computation to avoid concurrent promise explosion for deep trees.
// Empty subtrees are detected cheaply and resolved using a precomputed constant.
async function serverNodeHash(
  storage: IStorageBackend,
  topic: string,
  start: number,
  end: number,
  emptyTable: string[],
): Promise<string> {
  const cacheKey = [...KV_MERKLE_HASH, topic, start, end];
  const cached = await storage.get<string>(cacheKey);
  if (cached !== null) return cached;

  const nodeSize = end - start;
  let hash: string;
  if (nodeSize <= MERKLE_LEAF_SIZE) {
    // Leaf: computeLeafHash handles empty buckets correctly; no isRangeEmpty check needed.
    hash = await computeLeafHash(storage, topic, start, end);
  } else {
    // Short-circuit empty subtrees — avoids recursing into all 2^depth leaves.
    if (await isObjectRangeEmpty(storage, topic, start, end)) {
      const depth = Math.round(Math.log2(nodeSize / MERKLE_LEAF_SIZE));
      return emptyTable[Math.min(MERKLE_TREE_DEPTH, Math.max(0, depth))];
    }
    const mid = Math.floor((start + end) / 2);
    // Sequential — conservative; empty short-circuit makes Promise.all safe too, but sequential keeps KV round-trips bounded
    const leftHash = await serverNodeHash(storage, topic, start, mid, emptyTable);
    const rightHash = await serverNodeHash(storage, topic, mid, end, emptyTable);
    hash = await hashMerkleInternalNode(leftHash, rightHash);
  }

  await storage.set(cacheKey, hash);
  return hash;
}

export async function diffObjects(storage: IStorageBackend, topic: string, req: MerkleDiffRequest): Promise<ObjectDiffResponse | null> {
  const meta = await storage.get([...KV_TOPIC, topic]);
  if (!meta) return null;

  const emptyTable = await getEmptyHashTable();
  const serverHashes = await Promise.all(req.nodes.map(node => serverNodeHash(storage, topic, node.start, node.end, emptyTable)));

  const mismatches: MerkleMismatch[] = req.nodes
    .filter((node, idx) => serverHashes[idx] !== node.hash)
    .map(node => ({ start: node.start, end: node.end, isLeaf: node.end - node.start <= MERKLE_LEAF_SIZE }));

  if (mismatches.length === 0) return { kind: "match" };
  return { kind: "diff", mismatches };
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
    atomic = invalidateMerklePaths(atomic, topic, newSeq, oldSeq);

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
    atomic = invalidateMerklePaths(atomic, topic, newSeq, oldSeq);

    const result = await atomic.commit();
    if (result.ok) return tombstone;
  }
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
// is no longer a tombstone and should not be swept. Also invalidates the Merkle hash cache so
// the next diff recomputes the affected leaf rather than returning a stale match.
export async function sweepTombstones(storage: IStorageBackend, topic: string, cutoff?: number): Promise<void> {
  const effectiveCutoff = cutoff ?? Date.now() - TOMBSTONE_RETENTION_MS;
  for await (const item of storage.list<StoredObject>({ prefix: [...KV_OBJECT, topic] })) {
    if (item.value.payload === null && item.value.updatedAt < effectiveCutoff) {
      let atomic = storage.atomic()
        .check(item)
        .delete(item.key)
        .delete([...KV_OBJECT_SEQ, topic, item.value.seq]);
      atomic = invalidateMerklePath(atomic, topic, item.value.seq);

      // { ok: false } means a concurrent upsert replaced the tombstone — skip it safely.
      await atomic.commit();
    }
  }
}
