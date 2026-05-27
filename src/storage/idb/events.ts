/// <reference lib="dom" />
// IDB event store — implements ILocalEventStore over IndexedDB.

import type { ILocalEventStore } from "../backend.ts";
import type { EventEntry, ReadEventOptions } from "../capabilities.ts";
import type { IDBDatabase } from "./types.ts";

export const IDB_EVENT_STORE = "events";

type StoredEvent = {
  id: number;
  createdAt: number;
  updatedAt: number;
  payload: unknown;
};

type EventSummary = { id: number; updatedAt: number };

function toEntry(stored: StoredEvent): EventEntry {
  return { id: stored.id, createdAt: stored.createdAt, updatedAt: stored.updatedAt, payload: stored.payload };
}

export class IDBEventStore implements ILocalEventStore {
  constructor(private readonly db: IDBDatabase) {}

  readEvent(topic: string, id: number): Promise<EventEntry | null> {
    return this.db.get(IDB_EVENT_STORE, this.#key(topic, id))
      .then(result => result ? toEntry(result as StoredEvent) : null);
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

  // Returns summaries (id + updatedAt) for events with id in (start, end].
  async readEventSummaries(topic: string, start: number, end: number): Promise<EventSummary[]> {
    const tx = this.db.transaction(IDB_EVENT_STORE, "readonly");
    const store = tx.objectStore(IDB_EVENT_STORE);
    const range = IDBKeyRange.bound(this.#key(topic, start + 1), this.#key(topic, end));
    const results: EventSummary[] = [];
    let cursor = await store.openCursor(range);
    while (cursor) {
      const stored = cursor.value as StoredEvent;
      results.push({ id: stored.id, updatedAt: stored.updatedAt });
      cursor = await cursor.continue();
    }
    return results;
  }

  // Returns true if no event exists with id in (start, end].
  async isEventRangeEmpty(topic: string, start: number, end: number): Promise<boolean> {
    const tx = this.db.transaction(IDB_EVENT_STORE, "readonly");
    const store = tx.objectStore(IDB_EVENT_STORE);
    const range = IDBKeyRange.bound(this.#key(topic, start + 1), this.#key(topic, end));
    const count = await store.count(range);
    return count === 0;
  }

  #key(topic: string, id: number): [string, number] {
    return [topic, id];
  }

  async #readByIds(topic: string, ids: number[]): Promise<EventEntry[]> {
    const results = await Promise.all(ids.map(id => this.db.get(IDB_EVENT_STORE, this.#key(topic, id))));
    return results
      .filter((result): result is StoredEvent => result !== undefined)
      .map(toEntry)
      .sort((first, second) => first.id - second.id);
  }

  async #readRange(topic: string, start: number, size?: number): Promise<EventEntry[]> {
    const tx = this.db.transaction(IDB_EVENT_STORE, "readonly");
    const store = tx.objectStore(IDB_EVENT_STORE);
    const range = IDBKeyRange.bound(this.#key(topic, start), this.#key(topic, Infinity));
    const results: EventEntry[] = [];
    let cursor = await store.openCursor(range);
    while (cursor) {
      if (size !== undefined && results.length >= size) break;
      results.push(toEntry(cursor.value as StoredEvent));
      cursor = await cursor.continue();
    }
    return results;
  }

  #put(topic: string, entry: StoredEvent): Promise<void> {
    return this.db.put(IDB_EVENT_STORE, entry, this.#key(topic, entry.id)).then(() => undefined);
  }

  async #nextId(topic: string): Promise<number> {
    const tx = this.db.transaction(IDB_EVENT_STORE, "readonly");
    const store = tx.objectStore(IDB_EVENT_STORE);
    const range = IDBKeyRange.bound(this.#key(topic, 0), this.#key(topic, Infinity));
    const cursor = await store.openCursor(range, "prev");
    return cursor ? (cursor.key as [string, number])[1] + 1 : 1;
  }
}
