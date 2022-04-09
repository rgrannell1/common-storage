import { Event, Retries, Subscription, Topic } from "./types.ts";
import { DownstreamState } from "./services.ts";

export interface IStorage {
  getContent(topicId: string, lastId: number, size: number): Promise<{
    events: Event[];
    lastId?: number;
  }>;
  addContent(topicId: string, batchId: string, events: Event[]): Promise<{
    finished: boolean;
  }>;

  addTopic(name: string): Promise<boolean>;
  getTopic(name: string): Promise<Topic>;
  getTopicNames(): Promise<string[]>;
  getTopicStats(name: string): Promise<{
    topic: Topic;
    stats: {
      count: number;
    };
  }>;
  getSubscriptions(): Promise<Subscription[]>;

  addSubscription(topic: string, hookUrl: string): Promise<string>;
  getSubscription(id: string): Promise<Subscription>;
  deleteSubscription(id: string): Promise<{
    existed: boolean;
  }>;
  updateSubscription(id: string, topic: string, hookUrl: string): Promise<void>;

  addRetry(id: string): Promise<void>;
  getRetries(): Promise<Retries>;
  deleteRetry(id: string): Promise<void>;
  updateSubscriptionState(id: string, state: DownstreamState): Promise<void>;
}
