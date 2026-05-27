// Event diff — Merkle tree reconciliation for event topics
// @work.md

import type { IStorageBackend } from "../backend.ts";
import type { MerkleDiffRequest, MerkleDiffResponse, MerkleMismatch } from "../../capabilities.ts";
import type { StoredEvent } from "../types/stored-types.ts";
import { hashBucket, hashMerkleInternalNode } from "../../../core/hashing.ts";
import { KV_TOPIC, KV_EVENT, KV_MERKLE_HASH } from "../keys.ts";
import { MERKLE_LEAF_SIZE, MERKLE_TREE_DEPTH } from "../../../commons/constants.ts";

type BucketEntry = { id: number; updatedAt: number };

function byIdAscending(first: BucketEntry, second: BucketEntry): number {
  return first.id - second.id;
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

// Checks whether the event range (start, end] is empty.
async function isEventRangeEmpty(storage: IStorageBackend, topic: string, start: number, end: number): Promise<boolean> {
  for await (const _ of storage.list<StoredEvent>({
    start: [...KV_EVENT, topic, start + 1],
    end: [...KV_EVENT, topic, end + 1],
  }, { limit: 1 })) {
    return false;
  }
  return true;
}

// Scans events in (start, end] and hashes them.
async function computeLeafHash(storage: IStorageBackend, topic: string, start: number, end: number): Promise<string> {
  const entries: BucketEntry[] = [];
  for await (const item of storage.list<StoredEvent>({
    start: [...KV_EVENT, topic, start + 1],
    end: [...KV_EVENT, topic, end + 1],
  })) {
    entries.push({ id: item.value.id, updatedAt: item.value.updatedAt });
  }
  return hashBucket(entries.sort(byIdAscending));
}

// Returns the cached hash for a Merkle node, computing and caching it on a miss.
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
    if (await isEventRangeEmpty(storage, topic, start, end)) {
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

export async function diffEvents(storage: IStorageBackend, topic: string, req: MerkleDiffRequest): Promise<MerkleDiffResponse | null> {
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
