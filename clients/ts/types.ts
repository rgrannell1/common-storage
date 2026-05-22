// Public types for CmstrClient — response shapes and input types
// @work.md

export type TopicSummary = {
  topic: string;
  count: number;
  lastUpdated: number | string;
};

export type SubscriptionSummary = {
  source: string;
  topic: string;
  frequency: number;
  created: number | string;
};

export type EventEntry = {
  id: number;
  createdAt: number;
  updatedAt: number;
  payload: unknown;
};

export type ObjectEntry = {
  id: string;
  createdAt: number;
  updatedAt: number;
  payload: unknown;
};

export type FeedResponse = {
  topics: TopicSummary[];
  subscriptions: SubscriptionSummary[];
};

export type EventsResponse = {
  entries: EventEntry[];
  next: number | null;
};

export type GetEventsInput = {
  topic: string;
  start?: number;
  size?: number;
  ids?: number[];
  filter?: string;
};

export type GetEventInput = {
  topic: string;
  id: number;
};

export type PostEventInput = {
  topic: string;
  payload: unknown;
  idempotencyKey?: string;
};

export type PutEventInput = {
  topic: string;
  id: number;
  payload: unknown;
  idempotencyKey?: string;
};

export type GetObjectsInput = {
  topic: string;
  filter?: string;
};

export type GetObjectInput = {
  topic: string;
  id: string;
};

export type PutObjectInput = {
  topic: string;
  id: string;
  payload: unknown;
  idempotencyKey?: string;
};

export type DeleteObjectInput = {
  topic: string;
  id: string;
};

export type StreamEventsInput = {
  topic: string;
  start?: number;
  signal?: AbortSignal;
};

export type CmstrClientConfig = {
  url: string;
  token: string;
};
