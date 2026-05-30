// Client-side Merkle tree for building and traversing diff requests. Pure — no I/O.

import type { EventEntry, ObjectEntry } from "../storage/capabilities.ts";
import { hashBucket, hashMerkleInternalNode } from "./hashing.ts";
import { MERKLE_LEAF_SIZE, MERKLE_TREE_DEPTH, MERKLE_TREE_END } from "../commons/constants.ts";

// Minimal interface satisfied by both ClientMerkleTree and topic-bound IDBMerkleStore views.
export type IMerkleTree = { hashForRange(start: number, end: number): Promise<string> };

// Pre-computed hashes for empty subtrees at each depth (0 = leaf, MERKLE_TREE_DEPTH = root).
// Shared across all ClientMerkleTree instances; computed once per process.
let emptyHashTablePromise: Promise<string[]> | null = null;

export function getEmptyHashTable(): Promise<string[]> {
  if (emptyHashTablePromise === null) {
    emptyHashTablePromise = buildEmptyHashTable();
  }
  return emptyHashTablePromise;
}

// Returns the Merkle path from the leaf containing id to the root — node ranges to invalidate.
export function merklePath(id: number): { start: number; end: number }[] {
  const path: { start: number; end: number }[] = [];
  let rangeStart = 0, rangeEnd = MERKLE_TREE_END;
  while (rangeEnd - rangeStart > MERKLE_LEAF_SIZE) {
    path.push({ start: rangeStart, end: rangeEnd });
    const mid = Math.floor((rangeStart + rangeEnd) / 2);
    if (id <= mid) { rangeEnd = mid; } else { rangeStart = mid; }
  }
  path.push({ start: rangeStart, end: rangeEnd });
  return path;
}

async function buildEmptyHashTable(): Promise<string[]> {
  const hashes: string[] = [await hashBucket([])];
  for (let idx = 1; idx <= MERKLE_TREE_DEPTH; idx++) {
    hashes.push(await hashMerkleInternalNode(hashes[idx - 1], hashes[idx - 1]));
  }
  return hashes;
}

type BucketEntry = { id: number; updatedAt: number };

// Returns true if no entry's id falls in (start, end].
function isRangeEmpty(sorted: BucketEntry[], start: number, end: number): boolean {
  let lo = 0, hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid].id <= start) { lo = mid + 1; } else { hi = mid; }
  }
  return lo >= sorted.length || sorted[lo].id > end;
}

// Extracts entries whose id falls in (start, end] using binary search.
function entriesInRange(sorted: BucketEntry[], start: number, end: number): BucketEntry[] {
  let lo = 0, hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid].id <= start) { lo = mid + 1; } else { hi = mid; }
  }
  const result: BucketEntry[] = [];
  for (let idx = lo; idx < sorted.length && sorted[idx].id <= end; idx++) {
    result.push(sorted[idx]);
  }
  return result;
}

// In-memory Merkle tree over a sorted list of entries. Hashes are cached per range.
export class ClientMerkleTree {
  private readonly cache = new Map<string, Promise<string>>();

  constructor(
    private readonly entries: BucketEntry[],
    private readonly leafSize: number,
  ) {}

  hashForRange(start: number, end: number): Promise<string> {
    const key = `${start},${end}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const computed = this.computeRange(start, end);
    this.cache.set(key, computed);
    return computed;
  }

  private async computeRange(start: number, end: number): Promise<string> {
    const nodeSize = end - start;
    if (nodeSize <= this.leafSize) {
      return hashBucket(entriesInRange(this.entries, start, end));
    }
    // Short-circuit empty subtrees — avoids recursing into all 2^depth leaves for sparse trees
    if (isRangeEmpty(this.entries, start, end)) {
      const emptyTable = await getEmptyHashTable();
      const depth = Math.round(Math.log2(nodeSize / this.leafSize));
      return emptyTable[Math.min(MERKLE_TREE_DEPTH, Math.max(0, depth))];
    }
    const mid = Math.floor((start + end) / 2);
    const [leftHash, rightHash] = await Promise.all([
      this.hashForRange(start, mid),
      this.hashForRange(mid, end),
    ]);
    return hashMerkleInternalNode(leftHash, rightHash);
  }
}

export function buildEventMerkleTree(entries: EventEntry[]): ClientMerkleTree {
  const sorted = entries
    .map(entry => ({ id: entry.id, updatedAt: entry.updatedAt }))
    .sort((first, second) => first.id - second.id);
  return new ClientMerkleTree(sorted, MERKLE_LEAF_SIZE);
}

export function buildObjectMerkleTree(entries: ObjectEntry[]): ClientMerkleTree {
  const sorted = entries
    .map(entry => ({ id: entry.seq, updatedAt: entry.updatedAt }))
    .sort((first, second) => first.id - second.id);
  return new ClientMerkleTree(sorted, MERKLE_LEAF_SIZE);
}
