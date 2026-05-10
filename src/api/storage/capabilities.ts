// Storage capability sub-interfaces and their associated types — composed per route via intersection types
// @design.md

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

export type ContentEntry = {
  id: number;
  createdAt: number;
  updatedAt: number;
  payload: unknown;
};

export interface IWriteContent {
  // Returns null if the topic does not exist
  writeContent(topic: string, payload: unknown): Promise<ContentEntry | null>;
}

export type ReadContentOptions = {
  // First entry ID to return, inclusive; omit to start from the beginning
  start?: number;
  // Maximum number of entries to return
  size: number;
};

export interface IReadContent {
  // Returns null if the topic does not exist, an empty array if it exists but has no entries
  readContent(topic: string, opts: ReadContentOptions): Promise<ContentEntry[] | null>;
}
