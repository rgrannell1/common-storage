import type { Activity, Topic } from "../../types/types.ts";

/*
 * Topic
 */
export type AddTopicResponse = {
  existed: boolean;
};

export type DeleteTopicResponse = {
  existed: boolean;
};

export type GetTopicStatsResponse = {
  topic: Topic;
  stats: {
    count: number;
    lastUpdated: string;
  };
};

/*
 * Content
 */
export type AddContentResponse = {};

export type GetContentResponse = {
  topic: string;
  content: any[];
};

/*
 * Subscription
 */
export type GetSubscriptionResponse = {
  topic: string;
  target: string;
  lastMaxId: number;
  frequency: number;
};

export type AddSubscriptionResponse = {
  id: string;
  existed: boolean;
};

export type DeleteSubscriptionResponse = {
  existed: boolean;
};

export type GetSubscriptionIdsResponse = {
  ids: string[];
};

export type GetSubscriptionStatsResponse = {
  updateCount: number;
  contactedCount: number;
  lastContactedDate: string;
  lastStatus: string;
  lastUpdateDate: string;
};

/*
 * Activities
 */

/*
 * The storage interface; implement this to add a backend to common-storage.
 */
export interface IStorage {
  init(): Promise<void>;

  /* topic methods */
  getTopicNames(): Promise<string[]>;
  getTopicStats(name: string): Promise<GetTopicStatsResponse>;
  getTopic(topic: string): Promise<Topic>;
  addTopic(topic: string, description: string): Promise<AddTopicResponse>;
  deleteTopic(topic: string): Promise<DeleteTopicResponse>;

  /* content methods */
  addContent(
    batchId: string,
    topic: string,
    content: any[],
  ): Promise<AddContentResponse>;
  getContent(
    topic: string,
    startId: string | undefined,
  ): Promise<GetContentResponse>;

  /* subscription methods */
  getSubscription(id: string): Promise<GetSubscriptionResponse>;
  getSubscriptionStats(id: string): Promise<GetSubscriptionStatsResponse>;
  addSubscription(
    topic: string,
    target: string,
    frequency: number,
  ): Promise<AddSubscriptionResponse>;
  addSubscriptionSuccess(id: string, lastId: number): Promise<void>;
  addSubscriptionFailure(id: string): Promise<void>;
  deleteSubscription(id: string): Promise<DeleteSubscriptionResponse>;
  getSubscriptionIds(): Promise<GetSubscriptionIdsResponse>;

  /* activity methods */
  addActivity<T>(activity: Activity<T>): void;

  close(): void;
  cleanup(): Promise<void>;
}
