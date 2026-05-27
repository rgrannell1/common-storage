/// <reference lib="dom" />
// IDB object store — implements ILocalObjectStore over IndexedDB.

import type { ILocalObjectStore } from "../backend.ts";
import type { ObjectEntry } from "../capabilities.ts";
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

  // Returns summaries (seq as id + updatedAt) for objects with seq in (start, end].
  async readObjectSummaries(topic: string, start: number, end: number): Promise<{ id: number; updatedAt: number }[]> {
    const tx = this.db.transaction(IDB_OBJECT_STORE, "readonly");
    const index = tx.objectStore(IDB_OBJECT_STORE).index(IDB_OBJECT_SEQ_INDEX);
    const range = IDBKeyRange.bound([topic, start + 1], [topic, end]);
    const results: { id: number; updatedAt: number }[] = [];
    let cursor = await index.openCursor(range);
    while (cursor) {
      const stored = cursor.value as StoredObject;
      results.push({ id: stored.seq, updatedAt: stored.updatedAt });
      cursor = await cursor.continue();
    }
    return results;
  }

  // Returns true if no object exists with seq in (start, end].
  async isObjectRangeEmpty(topic: string, start: number, end: number): Promise<boolean> {
    const tx = this.db.transaction(IDB_OBJECT_STORE, "readonly");
    const index = tx.objectStore(IDB_OBJECT_STORE).index(IDB_OBJECT_SEQ_INDEX);
    const range = IDBKeyRange.bound([topic, start + 1], [topic, end]);
    const count = await index.count(range);
    return count === 0;
  }

  #key(topic: string, id: string): string {
    return `${topic}:${id}`;
  }

  #put(stored: StoredObject): Promise<void> {
    return this.db.put(IDB_OBJECT_STORE, stored, this.#key(stored.topic, stored.id)).then(() => undefined);
  }

  async #nextSeq(topic: string): Promise<number> {
    const tx = this.db.transaction(IDB_OBJECT_STORE, "readonly");
    const index = tx.objectStore(IDB_OBJECT_STORE).index(IDB_OBJECT_SEQ_INDEX);
    const range = IDBKeyRange.bound([topic, 0], [topic, Infinity]);
    const cursor = await index.openCursor(range, "prev");
    return cursor ? (cursor.key as [string, number])[1] + 1 : 1;
  }
}
