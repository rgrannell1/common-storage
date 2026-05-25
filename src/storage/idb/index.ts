/// <reference lib="dom" />
// IDBBackend — implements ILocalBackend over IndexedDB for browser use.

import type { ILocalBackend } from "../backend.ts";
import { IDBEventStore, IDB_EVENT_STORE } from "./events.ts";
import { IDBObjectStore, IDB_OBJECT_STORE } from "./objects.ts";
import { IDBCursorStore, IDB_CURSOR_STORE } from "./cursors.ts";

// v1: initial schema
// v2: by-seq index made non-unique so optimistic local writes don't throw a
//     ConstraintError when a remote sync later claims the same seq value
const IDB_VERSION = 2;

function openDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, IDB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      if (event.oldVersion < 1) {
        db.createObjectStore(IDB_EVENT_STORE);
        const store = db.createObjectStore(IDB_OBJECT_STORE);
        store.createIndex("by-seq", ["topic", "seq"], { unique: false });
        db.createObjectStore(IDB_CURSOR_STORE);
        return;
      }
      // v1 → v2: drop unique constraint so seq collisions are tolerated
      if (event.oldVersion < 2) {
        const store = req.transaction!.objectStore(IDB_OBJECT_STORE);
        store.deleteIndex("by-seq");
        store.createIndex("by-seq", ["topic", "seq"], { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class IDBBackend implements ILocalBackend {
  readonly events: IDBEventStore;
  readonly objects: IDBObjectStore;
  readonly cursors: IDBCursorStore;

  private constructor(db: IDBDatabase) {
    this.events = new IDBEventStore(db);
    this.objects = new IDBObjectStore(db);
    this.cursors = new IDBCursorStore(db);
  }

  // Opens (or creates) the named IndexedDB database and returns a ready backend.
  static async open(name: string): Promise<IDBBackend> {
    const db = await openDatabase(name);
    return new IDBBackend(db);
  }
}
