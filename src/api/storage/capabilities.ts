// Storage capability sub-interfaces and their associated types — composed per route via intersection types
// @work.md

import type { TopicConfig } from "../../commons/config.ts";

export type TopicStats = {
  topic: string;
  stats: {
    count: number;
    lastUpdated: number;
  };
};

export type Subscription = {
  source: string;
  topic: string;
  frequency: number;
  created: number;
};

export interface IGetTopicNames {
  getTopicNames(): Promise<string[]>;
}

export interface IGetTopicStats {
  getTopicStats(topic: string): Promise<TopicStats | null>;
}

export interface IGetSubscriptions {
  getSubscriptions(): Promise<Subscription[]>;
}

export interface ICreateTopics {
  createTopics(events: TopicConfig[], objects: TopicConfig[]): Promise<void>;
}

export type EventEntry = {
  id: number;
  createdAt: number;
  updatedAt: number;
  payload: unknown;
};

export interface IWriteEvent {
  // Returns null if the topic does not exist
  writeEvent(topic: string, payload: unknown): Promise<EventEntry | null>;
}

export type ReadEventOptions = {
  // First entry ID to return, inclusive; omit to start from the beginning
  start?: number;
  // Maximum number of entries to return; omit to return all
  size?: number;
  // Fetch specific entries by ID; when present, start and size are ignored
  ids?: number[];
};

export interface IReadEvents {
  // Returns null if the topic does not exist, an empty array if it exists but has no entries
  readEvents(topic: string, opts: ReadEventOptions): Promise<EventEntry[] | null>;
}

export interface IStreamEvents {
  // Yields entries from startId onward indefinitely, polling for new writes; terminates when signal is aborted or topic does not exist
  streamEvents(topic: string, startId: number, signal: AbortSignal): AsyncGenerator<EventEntry>;
}

export interface IReadEvent {
  // Returns null if the topic or entry does not exist
  readEvent(topic: string, id: number): Promise<EventEntry | null>;
}

export interface IUpdateEvent {
  // Upserts an event at the given ID. Returns null if the topic does not exist; created is true when a new entry was written.
  updateEvent(topic: string, id: number, payload: unknown, timestamps?: UpdateEventTimestamps): Promise<{ entry: EventEntry; created: boolean } | null>;
}

export type ObjectEntry = {
  id: string;
  createdAt: number;
  updatedAt: number;
  // null indicates a tombstone (deleted entry)
  payload: unknown;
};

export interface IUpsertObject {
  // Creates or updates an object entry; returns null if the topic does not exist
  upsertObject(topic: string, id: string, payload: unknown): Promise<ObjectEntry | null>;
}

export interface IReadObject {
  // Returns null if the topic or entry does not exist
  readObject(topic: string, id: string): Promise<ObjectEntry | null>;
}

export interface IDeleteObject {
  // Writes a tombstone (payload: null); returns null only if the topic does not exist
  deleteObject(topic: string, id: string): Promise<ObjectEntry | null>;
}

export interface IReadObjects {
  // Returns null if the topic does not exist; includes tombstones
  readObjects(topic: string): Promise<ObjectEntry[] | null>;
}

export interface IReadIdempotencyEntry {
  // Returns null if no cached entry exists for the (topic, key) pair
  readIdempotencyEntry(topic: string, key: string): Promise<unknown | null>;
}

export interface IWriteIdempotencyEntry {
  writeIdempotencyEntry(topic: string, key: string, entry: unknown): Promise<void>;
}

export interface IGetTopicType {
  // Returns null if the topic does not exist
  getTopicType(topic: string): Promise<"event" | "object" | null>;
}

export type EventDiffBucket = { start: number; end: number; hash: string };

export type EventDiffRequest = {
  bucketSize: number;
  root: string;
  buckets: EventDiffBucket[];
};

export type EventDiffResult =
  | { kind: "match" }
  | { kind: "diff"; ranges: { start: number; end: number }[] };

export interface IDiffEvents {
  // Returns null if the topic does not exist
  diffEvents(topic: string, req: EventDiffRequest): Promise<EventDiffResult | null>;
}

export type ObjectDiffEntry = { id: string; hash: string };

export type ObjectDiffRequest = {
  entries: ObjectDiffEntry[];
};

export type ObjectDiffResult =
  | { kind: "match" }
  | { kind: "diff"; ids: string[] };

export interface IDiffObjects {
  // Returns null if the topic does not exist
  diffObjects(topic: string, req: ObjectDiffRequest): Promise<ObjectDiffResult | null>;
}

export type UpdateEventTimestamps = {
  // Timestamp to use for createdAt when creating a new entry; ignored on update
  createdAt?: number;
  // Timestamp to use for updatedAt; defaults to now
  updatedAt?: number;
};

// Full storage backend — intersection of all capability interfaces. Use only where all capabilities are genuinely required (e.g. AppDeps). Route deps types should remain narrow.
export type IFullStorage =
  & IGetTopicNames
  & IGetTopicStats
  & IGetSubscriptions
  & IGetTopicType
  & ICreateTopics
  & IWriteEvent
  & IReadEvents
  & IStreamEvents
  & IReadEvent
  & IUpdateEvent
  & IDiffEvents
  & IUpsertObject
  & IReadObject
  & IDeleteObject
  & IReadObjects
  & IDiffObjects
  & IReadIdempotencyEntry
  & IWriteIdempotencyEntry;
