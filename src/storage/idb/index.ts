/// <reference lib="dom" />
// IDBBackend — implements ISyncBackend over IndexedDB for browser use.

import { openDB } from "idb";
import type { ISyncBackend } from "../backend.ts";
import { IDBEventStore, IDB_EVENT_STORE } from "./events.ts";
import { IDBObjectStore, IDB_OBJECT_STORE } from "./objects.ts";
import { IDBCursorStore, IDB_CURSOR_STORE } from "./cursors.ts";
import { IDBMerkleStore } from "./merkle.ts";

// v1: initial schema
// v2: by-seq index made non-unique so optimistic local writes don't throw a
//     ConstraintError when a remote sync later claims the same seq value
// v3: event store rebuilt with compound [topic, id] keys for correct numeric ordering;
//     cursor store reset (old cursors invalid); merkle hash cache stores added
const IDB_VERSION = 3;

const IDB_MERKLE_EVENT_STORE = "merkle-events";
const IDB_MERKLE_OBJECT_STORE = "merkle-objects";

export class IDBBackend implements ISyncBackend {
  readonly events: IDBEventStore;
  readonly objects: IDBObjectStore;
  readonly cursors: IDBCursorStore;
  readonly merkleEvents: IDBMerkleStore;
  readonly merkleObjects: IDBMerkleStore;

  private constructor(db: Awaited<ReturnType<typeof openDB>>) {
    this.events = new IDBEventStore(db);
    this.objects = new IDBObjectStore(db);
    this.cursors = new IDBCursorStore(db);
    this.merkleEvents = new IDBMerkleStore(
      db,
      IDB_MERKLE_EVENT_STORE,
      (topic, start, end) => this.events.readEventSummaries(topic, start, end),
      (topic, start, end) => this.events.isEventRangeEmpty(topic, start, end),
    );
    this.merkleObjects = new IDBMerkleStore(
      db,
      IDB_MERKLE_OBJECT_STORE,
      (topic, start, end) => this.objects.readObjectSummaries(topic, start, end),
      (topic, start, end) => this.objects.isObjectRangeEmpty(topic, start, end),
    );
  }

  // Opens (or creates) the named IndexedDB database and returns a ready backend.
  static async open(name: string): Promise<IDBBackend> {
    const db = await openDB(name, IDB_VERSION, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        if (oldVersion === 0) {
          // Fresh install — create v3 schema directly.
          db.createObjectStore(IDB_EVENT_STORE);
          const objStore = db.createObjectStore(IDB_OBJECT_STORE);
          objStore.createIndex("by-seq", ["topic", "seq"], { unique: false });
          db.createObjectStore(IDB_CURSOR_STORE);
          db.createObjectStore(IDB_MERKLE_EVENT_STORE);
          db.createObjectStore(IDB_MERKLE_OBJECT_STORE);
          return;
        }
        // v1 → v2: drop unique constraint on by-seq index.
        if (oldVersion < 2) {
          const store = transaction.objectStore(IDB_OBJECT_STORE);
          store.deleteIndex("by-seq");
          store.createIndex("by-seq", ["topic", "seq"], { unique: false });
        }
        // v2 → v3: event store uses compound [topic, id] keys; cursor store reset; merkle stores added.
        if (oldVersion < 3) {
          db.deleteObjectStore(IDB_EVENT_STORE);
          db.createObjectStore(IDB_EVENT_STORE);
          db.deleteObjectStore(IDB_CURSOR_STORE);
          db.createObjectStore(IDB_CURSOR_STORE);
          db.createObjectStore(IDB_MERKLE_EVENT_STORE);
          db.createObjectStore(IDB_MERKLE_OBJECT_STORE);
        }
      },
    });
    return new IDBBackend(db);
  }
}
