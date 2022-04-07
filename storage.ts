import hash from "https://deno.land/x/object_hash/index.ts";
import { nanoid } from "https://deno.land/x/nanoid/mod.ts";

import * as constants from "./constants.ts";
import {
  Batches,
  Content,
  Contents,
  Event,
  Retries,
  Subscription,
  Subscriptions,
  Topics,
} from "./types.ts";

export class InMemoryStorage {
  topics: Topics = {};
  subscriptions: Subscriptions = {};
  batches: Batches = {};
  content: Contents = {};
  retries: Retries = {};
  id = 0;

  /**
   * Add a subscribable topic to the server.
   *
   * @param {*} name
   * @return {*}
   */
  async addTopic(name: string): Promise<boolean> {
    if (this.topics[name]) {
      return true;
    }

    this.topics[name] = {
      name,
      createdOn: (new Date()).toISOString(),
    };

    this.content[name] = [];

    return false;
  }

  async getContent(topicId: string, lastId: number, size: number) {
    let currentId = -1;
    const events: Event[] = [];

    for (const content of this.content[topicId]) {
      let id = content.id as number;
      if (lastId && id <= lastId) {
        continue;
      }

      if (events.length >= size) {
        break;
      }

      currentId = content.id as number;
      events.push(content.event);
    }

    const response: { events: Event[]; lastId?: number } = { events };
    if (currentId > 0) {
      response.lastId = currentId;
    } else if (lastId) {
      response.lastId = lastId;
    }

    return response;
  }

  async addContent(
    topicId: string,
    batchId: string,
    events: Event[],
  ): Promise<boolean> {
    const topic = await this.getTopic(topicId);

    if (!topic) {
      throw new Error(`topic "${topicId}" does not exist.`);
    }

    if (!this.batches[batchId]) {
      this.batches[batchId] = {
        topic: topicId,
        events: [],
      };
    }
    const batch = this.batches[batchId];

    if (topicId !== batch.topic) {
      throw new Error(
        `submitted content with batchId "${batchId}" using ${topicId}, expected ${batch.topic}`,
      );
    }

    if (events.length === 0) {
      const tgt = this.content[batch.topic];
      tgt.push(...batch.events.map((event: Event) => {
        return {
          event,
          hash: hash(event.data),
          id: this.id++,
        };
      }));
      delete this.batches[batchId];

      tgt.sort((content0: Content, content1: Content) => {
        return (content0.id as number) - (content1.id as number);
      });

      return true;
    } else {
      batch.events.push(...events);
      return false;
    }
  }

  /**
   * Get basic topic information, like name and creation-date.
   *
   * @param {*} name
   */
  async getTopic(name: string) {
    return this.topics[name];
  }

  async getTopicNames() {
    return Object.keys(this.topics);
  }

  async getTopicStats(name: string) {
    return {
      topic: await this.getTopic(name),
      stats: {
        count: this.content[name].length,
      },
    };
  }

  async addSubscription(topic: string, hookUrl: string) {
    const id = nanoid();

    this.subscriptions[id] = {
      id,
      topic,
      hookUrl,
    };

    return id;
  }

  async getSubscription(id: string) {
    return this.subscriptions[id];
  }
  async getSubscriptions(): Promise<Subscription[]> {
    return Object.values(this.subscriptions);
  }

  async deleteSubscription(id: string) {
    delete this.subscriptions[id];
  }

  async updateSubscription(id: string, topic: string, hookUrl: string) {
    if (!this.subscriptions[id]) {
      return;
    }

    this.subscriptions[id] = {
      id,
      topic,
      hookUrl,
    };
  }

  async addRetry(id: string) {
    this.retries[id] = {
      subscription: await this.getSubscription(id),
      after: Date.now() + (constants.RETRY_SECONDS * 1e3),
    };
  }

  async getRetries() {
    return this.retries;
  }

  async deleteRetry(id: string) {
    delete this.retries[id];
  }
}
