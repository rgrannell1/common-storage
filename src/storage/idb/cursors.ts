/// <reference lib="dom" />
// IDB cursor store — persists last-seen sync position per topic in IndexedDB.

import type { ICursorStore } from "../backend.ts";
import type { IDBDatabase } from "./types.ts";

// IDB object store name for sync cursors
export const IDB_CURSOR_STORE = "cursors";

export class IDBCursorStore implements ICursorStore {
  constructor(private readonly db: IDBDatabase) {}

  async getEventCursor(topic: string): Promise<number> {
    return await this.#get(`event:${topic}`);
  }

  setEventCursor(topic: string, id: number): Promise<void> {
    return this.#set(`event:${topic}`, id);
  }

  async getObjectCursor(topic: string): Promise<number> {
    return await this.#get(`object:${topic}`);
  }

  setObjectCursor(topic: string, seq: number): Promise<void> {
    return this.#set(`object:${topic}`, seq);
  }

  async #get(key: string): Promise<number> {
    const val = await this.db.get(IDB_CURSOR_STORE, key);
    return (val as number | undefined) ?? 0;
  }

  #set(key: string, value: number): Promise<void> {
    return this.db.put(IDB_CURSOR_STORE, value, key).then(() => undefined);
  }
}
