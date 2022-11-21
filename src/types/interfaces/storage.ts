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

export interface IStorage {
  init(): Promise<void>;
  getTopicNames(): Promise<string[]>;
  getTopicStats(name: string): Promise<GetTopicStatsResponse>;
  getTopic(topic: string): Promise<Topic>;
  addTopic(topic: string, description: string): Promise<AddTopicResponse>;
  deleteTopic(topic: string): Promise<DeleteTopicResponse>
  addContent(
    batchId: string,
    topic: string,
    content: any[],
  ): Promise<AddContentResponse>;
  getContent(
    topic: string,
    startId: string | undefined,
  ): Promise<GetContentResponse>;
  close(): void;
  cleanup(): Promise<void>;
}
