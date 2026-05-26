/// <reference lib="dom" />
// IDB object store — implements ILocalObjectStore over IndexedDB.

import type { ILocalObjectStore } from "../backend.ts";
import type { ObjectEntry, ObjectDiffRequest, ObjectDiffResult } from "../capabilities.ts";
import { hashBucket, hashBucketRoot } from "../../core/hashing.ts";
import { DEFAULT_OBJECT_BUCKET_SIZE } from "../../commons/constants.ts";
import type { IDBDatabase } from "./types.ts";

export const IDB_OBJECT_STORE = "objects";
const IDB_OBJECT_SEQ_INDEX = "by-seq";

type StoredObject = {
  id: string;
  topic: string;
  seq: number;
  createdAt: number;
  updatedAt: number;
  payload: unknown;
};

function toEntry(stored: StoredObject): ObjectEntry {
  return { id: stored.id, seq: stored.seq, createdAt: stored.createdAt, updatedAt: stored.updatedAt, payload: stored.payload };
}

export class IDBObjectStore implements ILocalObjectStore {
  constructor(private readonly db: IDBDatabase) {}

  readObject(topic: string, id: string): Promise<ObjectEntry | null> {
    return this.db.get(IDB_OBJECT_STORE, this.#key(topic, id))
      .then(result => result ? toEntry(result as StoredObject) : null);
  }

  async readObjectsBySeq(topic: string, opts: { start?: number; size?: number }): Promise<ObjectEntry[] | null> {
    const tx = this.db.transaction(IDB_OBJECT_STORE, "readonly");
    const index = tx.objectStore(IDB_OBJECT_STORE).index(IDB_OBJECT_SEQ_INDEX);
    const lower = opts.start ?? 0;
    const upper = [topic, "￿"];
    const range = IDBKeyRange.bound([topic, lower], upper);
    const results: ObjectEntry[] = [];
    let cursor = await index.openCursor(range);
    while (cursor) {
      if (opts.size !== undefined && results.length >= opts.size) break;
      const stored = cursor.value as StoredObject;
      if (stored.topic !== topic) break;
      results.push(toEntry(stored));
      cursor = await cursor.continue();
    }
    return results;
  }

  async upsertObject(topic: string, id: string, payload: unknown, timestamps?: { createdAt?: number; updatedAt?: number; seq?: number }): Promise<ObjectEntry | null> {
    const existing = await this.readObject(topic, id);
    const now = Date.now();
    // Use remote seq when provided (sync replication path) so diff hashes match the server.
    const seq = timestamps?.seq ?? await this.#nextSeq(topic);
    const stored: StoredObject = {
      id, topic, seq,
      createdAt: timestamps?.createdAt ?? existing?.createdAt ?? now,
      updatedAt: timestamps?.updatedAt ?? now,
      payload,
    };
    await this.#put(stored);
    return toEntry(stored);
  }

  async deleteObject(topic: string, id: string, timestamps?: { createdAt?: number; updatedAt?: number; seq?: number }): Promise<ObjectEntry | null> {
    const existing = await this.readObject(topic, id);
    const now = Date.now();
    const seq = timestamps?.seq ?? await this.#nextSeq(topic);
    const stored: StoredObject = {
      id, topic, seq,
      createdAt: timestamps?.createdAt ?? existing?.createdAt ?? now,
      updatedAt: timestamps?.updatedAt ?? now,
      payload: null,
    };
    await this.#put(stored);
    return toEntry(stored);
  }

  async diffObjects(topic: string, req: ObjectDiffRequest): Promise<ObjectDiffResult | null> {
    const all = await this.readObjectsBySeq(topic, {}) ?? [];
    const bucketMap = new Map<number, Array<{ id: number; updatedAt: number }>>();
    for (const entry of all) {
      const start = Math.floor((entry.seq - 1) / DEFAULT_OBJECT_BUCKET_SIZE) * DEFAULT_OBJECT_BUCKET_SIZE;
      if (!bucketMap.has(start)) bucketMap.set(start, []);
      bucketMap.get(start)!.push({ id: entry.seq, updatedAt: entry.updatedAt });
    }

    const bucketStarts = [...bucketMap.keys()].sort((first, second) => first - second);
    const localHashes = await Promise.all(bucketStarts.map(async (start) => {
      const sorted = (bucketMap.get(start) ?? []).sort((first, second) => first.id - second.id);
      return { start, hash: await hashBucket(sorted) };
    }));
    const localRoot = await hashBucketRoot(localHashes.map(bucket => bucket.hash));
    if (localRoot === req.root) return { kind: "match" };

    const localHashMap = new Map(localHashes.map(bucket => [bucket.start, bucket.hash]));
    const clientStarts = new Set(req.buckets.map(bucket => bucket.start));
    const ranges: { start: number; end: number }[] = [];
    for (const clientBucket of req.buckets) {
      const localHash = localHashMap.get(clientBucket.start);
      if (localHash !== clientBucket.hash) {
        ranges.push({ start: clientBucket.start, end: clientBucket.end });
      }
    }
    // Include local-only buckets the client did not cover
    for (const start of bucketStarts) {
      if (!clientStarts.has(start)) {
        ranges.push({ start, end: start + DEFAULT_OBJECT_BUCKET_SIZE });
      }
    }
    return { kind: "diff", ranges };
  }

  #key(topic: string, id: string): string {
    return `${topic}:${id}`;
  }

  #put(stored: StoredObject): Promise<void> {
    return this.db.put(IDB_OBJECT_STORE, stored, this.#key(stored.topic, stored.id)).then(() => undefined);
  }

  async #nextSeq(topic: string): Promise<number> {
    const all = await this.readObjectsBySeq(topic, {}) ?? [];
    return all.length > 0 ? all[all.length - 1].seq + 1 : 1;
  }
}
