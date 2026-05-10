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
