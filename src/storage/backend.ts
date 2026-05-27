// ISyncBackend — the shared storage interface for all CommonStorageNode backends.
// DenoKVBackend satisfies this as a subset; IDBBackend implements it for browsers.

import type { EventEntry, ReadEventOptions, ObjectEntry } from "./capabilities.ts";

// Tracks the last-seen sync position per topic. Used by node sync on both client and server.
export interface ICursorStore {
  getEventCursor(topic: string): Promise<number>;
  setEventCursor(topic: string, id: number): Promise<void>;
  getObjectCursor(topic: string): Promise<number>;
  setObjectCursor(topic: string, seq: number): Promise<void>;
}

// Read/write interface for event topics.
export interface ILocalEventStore {
  readEvent(topic: string, id: number): Promise<EventEntry | null>;
  readEvents(topic: string, opts: ReadEventOptions): Promise<EventEntry[] | null>;
  // Upserts an event at the given ID; used during sync replication.
  updateEvent(topic: string, id: number, payload: unknown, timestamps?: { createdAt?: number; updatedAt?: number }): Promise<{ entry: EventEntry; created: boolean } | null>;
  // Appends a new event; server assigns the ID.
  writeEvent(topic: string, payload: unknown): Promise<EventEntry | null>;
}

// Timestamps (and remote seq) preserved during sync replication. seq is client-only — KV backends
// ignore it and always generate a local monotonic seq.
export type ReplicaTimestamps = {
  createdAt?: number;
  updatedAt?: number;
  // Remote seq to use as the local seq; used by IDB so diff hashes match the server.
  seq?: number;
};

// Read/write interface for object topics.
export interface ILocalObjectStore {
  readObject(topic: string, id: string): Promise<ObjectEntry | null>;
  readObjectsBySeq(topic: string, opts: { start?: number; size?: number }): Promise<ObjectEntry[] | null>;
  upsertObject(topic: string, id: string, payload: unknown, timestamps?: ReplicaTimestamps): Promise<ObjectEntry | null>;
  deleteObject(topic: string, id: string, timestamps?: ReplicaTimestamps): Promise<ObjectEntry | null>;
}

// Persistent Merkle hash cache for a single topic dimension (events or objects).
// When present in ISyncBackend, sync skips full entry reads and uses cached hashes instead.
export interface ILocalMerkleStore {
  hashForRange(topic: string, start: number, end: number): Promise<string>;
  forTopic(topic: string): { hashForRange(start: number, end: number): Promise<string> };
  invalidatePath(topic: string, id: number): Promise<void>;
  invalidatePaths(topic: string, newId: number, oldId?: number): Promise<void>;
}

// Minimal backend interface for a CommonStorageNode — covers local reads, writes, diff, and cursor tracking.
// Does not include rate limiting, metrics, or idempotency — those are server-only concerns.
export interface ISyncBackend {
  events: ILocalEventStore;
  objects: ILocalObjectStore;
  cursors: ICursorStore;
  merkleEvents?: ILocalMerkleStore;
  merkleObjects?: ILocalMerkleStore;
}
