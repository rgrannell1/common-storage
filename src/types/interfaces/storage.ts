import type { Topic } from "../../types/types.ts";

export type GetTopicStatsResponse = {
  topic: Topic;
  stats: {
    count: number;
  };
};

export type AddTopicResponse = {
  existed: boolean;
};

export type DeleteTopicResponse = {
  existed: boolean;
}

export type AddContentResponse = {};

export type GetContentResponse = {
  topic: string;
  content: any[];
};

export type GetSubscriptionResponse = {
  server: string;
  from: string;
  to: string;
  frequency: number;
}

export type AddSubscriptionResponse = {
  id: string;
  existed: boolean;
}

export type DeleteSubscriptionResponse = {
  existed: boolean;
}

export type GetSubscriptionStatsResponse = {
  updateCount: number;
  contactedCount: number;
  lastContactedDate: string;
  lastStatus: string;
  lastUpdateDate: string;
}

export interface IStorage {
  init(): Promise<void>;

  /* topic methods */
  getTopicNames(): Promise<string[]>;
  getTopicStats(name: string): Promise<GetTopicStatsResponse>;
  getTopic(topic: string): Promise<Topic>;
  addTopic(topic: string, description: string): Promise<AddTopicResponse>;
  deleteTopic(topic: string): Promise<DeleteTopicResponse>

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
  addSubscription(topic: string, target: string, frequency: number): Promise<AddSubscriptionResponse>;
  deleteSubscription(id: string): Promise<DeleteSubscriptionResponse>;

  close(): void;
  cleanup(): Promise<void>;
}
