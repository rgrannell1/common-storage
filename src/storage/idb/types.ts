/// <reference lib="dom" />
// Shared IDB type aliases — idb-wrapper types used across the IDB backend.

import type { IDBPDatabase } from "idb";

// IDBDatabase is the idb-wrapper typed database handle (promise-based API).
export type IDBDatabase = IDBPDatabase;
