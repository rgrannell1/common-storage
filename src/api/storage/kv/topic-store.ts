// KvTopicStore — implements ITopicService; delegates to the Topics domain module
// @work.md

import type { IStorageBackend } from "../backend.ts";
import type { ITopicService, TopicStats, Subscription } from "../capabilities.ts";
import type { TopicConfig } from "../../../commons/config.ts";
import * as Topics from "./topics.ts";

export class KvTopicStore implements ITopicService {
  constructor(private readonly storage: IStorageBackend) {}

  getTopicType(topic: string): Promise<"event" | "object" | null> {
    return Topics.getTopicType(this.storage, topic);
  }

  getTopicNames(): Promise<string[]> {
    return Topics.getTopicNames(this.storage);
  }

  getTopicStats(topic: string): Promise<TopicStats | null> {
    return Topics.getTopicStats(this.storage, topic);
  }

  getSubscriptions(): Promise<Subscription[]> {
    return Topics.getSubscriptions();
  }

  createTopics(events: TopicConfig[], objects: TopicConfig[]): Promise<void> {
    return Topics.createTopics(this.storage, events, objects);
  }
}
