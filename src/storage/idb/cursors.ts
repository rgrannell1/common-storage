/// <reference lib="dom" />
// IDB cursor store — persists last-seen sync position per topic in IndexedDB.

import type { ICursorStore } from "../backend.ts";
import type { IDBDatabase } from "./types.ts";

// IDB object store name for sync cursors
export const IDB_CURSOR_STORE = "cursors";

export class IDBCursorStore implements ICursorStore {
  constructor(private readonly db: IDBDatabase) {}

  getEventCursor(topic: string): Promise<number> {
    return this.#get(`event:${topic}`);
  }

  setEventCursor(topic: string, id: number): Promise<void> {
    return this.#set(`event:${topic}`, id);
  }

  getObjectCursor(topic: string): Promise<number> {
    return this.#get(`object:${topic}`);
  }

  setObjectCursor(topic: string, seq: number): Promise<void> {
    return this.#set(`object:${topic}`, seq);
  }

  #get(key: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(IDB_CURSOR_STORE, "readonly");
      const req = tx.objectStore(IDB_CURSOR_STORE).get(key);
      req.onsuccess = () => resolve((req.result as number | undefined) ?? 0);
      req.onerror = () => reject(req.error);
    });
  }

  #set(key: string, value: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(IDB_CURSOR_STORE, "readwrite");
      const req = tx.objectStore(IDB_CURSOR_STORE).put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}
