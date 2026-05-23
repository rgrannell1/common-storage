// Types for values stored in Deno KV — not exposed through the API

// Persisted topic metadata; written once at creation, never updated
export type StoredTopic = {
  type: "event" | "object";
  schema: string | undefined;
  createdAt: number;
};

// Mutable topic statistics; updated on every content write
export type StoredTopicStats = {
  count: number;
  lastUpdated: number;
};

// A single event topic entry as stored in KV
export type StoredEvent = {
  id: number;
  createdAt: number;
  updatedAt: number;
  payload: unknown;
};

// A single object topic entry as stored in KV; payload null indicates a tombstone
export type StoredObject = {
  id: string;
  seq: number;
  createdAt: number;
  updatedAt: number;
  payload: unknown;
};
