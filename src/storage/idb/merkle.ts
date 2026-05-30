/// <reference lib="dom" />
// IDB Merkle hash cache — implements ILocalMerkleStore over IndexedDB.
// Persists computed Merkle node hashes, keyed by [topic, start, end].
// Prevents re-reading all local entries on every sync cycle.

import type { ILocalMerkleStore } from "../backend.ts";
import type { IDBDatabase } from "./types.ts";
import { hashBucket, hashMerkleInternalNode } from "../../core/hashing.ts";
import { merklePath, getEmptyHashTable } from "../../core/diff.ts";
import { MERKLE_LEAF_SIZE, MERKLE_TREE_DEPTH } from "../../commons/constants.ts";

type RangeSummary = { id: number; updatedAt: number };

// Topic-bound view returned by IDBMerkleStore.forTopic — satisfies IMerkleTree.
class BoundMerkleTree {
  constructor(
    private readonly store: IDBMerkleStore,
    private readonly topic: string,
  ) {}

  hashForRange(start: number, end: number): Promise<string> {
    return this.store.hashForRange(this.topic, start, end);
  }
}

export class IDBMerkleStore implements ILocalMerkleStore {
  constructor(
    private readonly db: IDBDatabase,
    private readonly storeName: string,
    // Reads entry summaries with id (or seq for objects) in (start, end], sorted
    // ascending.
    private readonly readSummaries: (
      topic: string,
      start: number,
      end: number,
    ) => Promise<RangeSummary[]>,
    // Returns true if no entry exists with id (or seq) in (start, end].
    private readonly isRangeEmpty: (
      topic: string,
      start: number,
      end: number,
    ) => Promise<boolean>,
  ) {}

  // Returns a topic-bound view compatible with IMerkleTree for use in merkleDiff.
  forTopic(topic: string): { hashForRange(start: number, end: number): Promise<string> } {
    return new BoundMerkleTree(this, topic);
  }

  async hashForRange(topic: string, start: number, end: number): Promise<string> {
    const cached = await this.db.get(this.storeName, [topic, start, end]);
    if (cached !== undefined) return cached as string;
    const hash = await this.#computeRange(topic, start, end);
    await this.db.put(this.storeName, hash, [topic, start, end]);
    return hash;
  }

  // Removes all cached hashes on the path from the leaf containing id to the root.
  async invalidatePath(topic: string, id: number): Promise<void> {
    const tx = this.db.transaction(this.storeName, "readwrite");
    const store = tx.objectStore(this.storeName);
    for (const node of merklePath(id)) {
      store.delete([topic, node.start, node.end]);
    }
    await tx.done;
  }

  // Invalidates both old and new seq paths in a single transaction — handles objects
  // where seq changes on update.
  async invalidatePaths(topic: string, newId: number, oldId?: number): Promise<void> {
    if (oldId === undefined || oldId === newId) {
      return this.invalidatePath(topic, newId);
    }
    const tx = this.db.transaction(this.storeName, "readwrite");
    const store = tx.objectStore(this.storeName);
    for (const node of merklePath(newId)) {
      store.delete([topic, node.start, node.end]);
    }
    for (const node of merklePath(oldId)) {
      store.delete([topic, node.start, node.end]);
    }
    await tx.done;
  }

  async #computeRange(topic: string, start: number, end: number): Promise<string> {
    const nodeSize = end - start;
    if (nodeSize <= MERKLE_LEAF_SIZE) {
      const entries = await this.readSummaries(topic, start, end);
      return hashBucket(entries);
    }
    if (await this.isRangeEmpty(topic, start, end)) {
      const emptyTable = await getEmptyHashTable();
      const depth = Math.round(Math.log2(nodeSize / MERKLE_LEAF_SIZE));
      return emptyTable[Math.min(MERKLE_TREE_DEPTH, Math.max(0, depth))];
    }
    const mid = Math.floor((start + end) / 2);
    const leftHash = await this.hashForRange(topic, start, mid);
    const rightHash = await this.hashForRange(topic, mid, end);
    return hashMerkleInternalNode(leftHash, rightHash);
  }
}
