/// <reference lib="dom" />
// IDB event store — implements ILocalEventStore over IndexedDB.

import type { ILocalEventStore } from "../backend.ts";
import type { EventEntry, ReadEventOptions, EventDiffRequest, EventDiffResult } from "../capabilities.ts";
import { hashBucket, hashBucketRoot } from "../../core/hashing.ts";
import { DEFAULT_EVENT_BUCKET_SIZE } from "../../commons/constants.ts";
import type { IDBDatabase } from "./types.ts";

export const IDB_EVENT_STORE = "events";

type StoredEvent = {
  id: number;
  createdAt: number;
  updatedAt: number;
  payload: unknown;
};

function toEntry(stored: StoredEvent): EventEntry {
  return { id: stored.id, createdAt: stored.createdAt, updatedAt: stored.updatedAt, payload: stored.payload };
}

export class IDBEventStore implements ILocalEventStore {
  constructor(private readonly db: IDBDatabase) {}

  readEvent(topic: string, id: number): Promise<EventEntry | null> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(IDB_EVENT_STORE, "readonly");
      const req = tx.objectStore(IDB_EVENT_STORE).get(this.#key(topic, id));
      req.onsuccess = () => resolve(req.result ? toEntry(req.result as StoredEvent) : null);
      req.onerror = () => reject(req.error);
    });
  }

  readEvents(topic: string, opts: ReadEventOptions): Promise<EventEntry[] | null> {
    if (opts.ids) {
      return this.#readByIds(topic, opts.ids);
    }
    return this.#readRange(topic, opts.start ?? 1, opts.size);
  }

  async updateEvent(
    topic: string,
    id: number,
    payload: unknown,
    timestamps?: { createdAt?: number; updatedAt?: number },
  ): Promise<{ entry: EventEntry; created: boolean } | null> {
    const existing = await this.readEvent(topic, id);
    const now = Date.now();
    const entry: StoredEvent = {
      id,
      createdAt: timestamps?.createdAt ?? existing?.createdAt ?? now,
      updatedAt: timestamps?.updatedAt ?? now,
      payload,
    };
    await this.#put(topic, entry);
    return { entry: toEntry(entry), created: existing === null };
  }

  async writeEvent(topic: string, payload: unknown): Promise<EventEntry | null> {
    const nextId = await this.#nextId(topic);
    const now = Date.now();
    const entry: StoredEvent = { id: nextId, createdAt: now, updatedAt: now, payload };
    await this.#put(topic, entry);
    return toEntry(entry);
  }

  async diffEvents(topic: string, req: EventDiffRequest): Promise<EventDiffResult | null> {
    const all = await this.readEvents(topic, {}) ?? [];
    const bucketMap = new Map<number, Array<{ id: number; updatedAt: number }>>();
    for (const entry of all) {
      const start = Math.floor((entry.id - 1) / DEFAULT_EVENT_BUCKET_SIZE) * DEFAULT_EVENT_BUCKET_SIZE;
      if (!bucketMap.has(start)) bucketMap.set(start, []);
      bucketMap.get(start)!.push({ id: entry.id, updatedAt: entry.updatedAt });
    }

    // Build local bucket hashes and root
    const bucketStarts = [...bucketMap.keys()].sort((first, second) => first - second);
    const localHashes = await Promise.all(bucketStarts.map(async (start) => {
      const sorted = (bucketMap.get(start) ?? []).sort((first, second) => first.id - second.id);
      return { start, hash: await hashBucket(sorted) };
    }));
    const localRoot = await hashBucketRoot(localHashes.map(bucket => bucket.hash));
    if (localRoot === req.root) return { kind: "match" };

    // Return ranges where client's bucket hashes differ from local
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
        ranges.push({ start, end: start + DEFAULT_EVENT_BUCKET_SIZE });
      }
    }
    return { kind: "diff", ranges };
  }

  #key(topic: string, id: number): string {
    return `${topic}:${id}`;
  }

  #readByIds(topic: string, ids: number[]): Promise<EventEntry[]> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(IDB_EVENT_STORE, "readonly");
      const store = tx.objectStore(IDB_EVENT_STORE);
      const results: EventEntry[] = [];
      let pending = ids.length;
      if (pending === 0) { resolve([]); return; }
      for (const id of ids) {
        const req = store.get(this.#key(topic, id));
        req.onsuccess = () => {
          if (req.result) results.push(toEntry(req.result as StoredEvent));
          if (--pending === 0) resolve(results.sort((first, second) => first.id - second.id));
        };
        req.onerror = () => reject(req.error);
      }
    });
  }

  #readRange(topic: string, start: number, size?: number): Promise<EventEntry[]> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(IDB_EVENT_STORE, "readonly");
      const store = tx.objectStore(IDB_EVENT_STORE);
      // Use a cursor over the topic's key range
      const lower = this.#key(topic, start);
      const upper = `${topic}:￿`;
      const range = IDBKeyRange.bound(lower, upper);
      const results: EventEntry[] = [];
      const cursor = store.openCursor(range);
      cursor.onsuccess = () => {
        const cur = cursor.result;
        if (!cur || (size !== undefined && results.length >= size)) {
          resolve(results);
          return;
        }
        results.push(toEntry(cur.value as StoredEvent));
        cur.continue();
      };
      cursor.onerror = () => reject(cursor.error);
    });
  }

  #put(topic: string, entry: StoredEvent): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(IDB_EVENT_STORE, "readwrite");
      const req = tx.objectStore(IDB_EVENT_STORE).put(entry, this.#key(topic, entry.id));
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async #nextId(topic: string): Promise<number> {
    const all = await this.readEvents(topic, {}) ?? [];
    return all.length > 0 ? all[all.length - 1].id + 1 : 1;
  }
}
