// Deno KV implementation of IStorageBackend and domain capability interfaces
// @design.md

import type { IAtomicWriter, IStorageBackend } from "./backend.ts";
import type { ICreateTopics, IGetSubscriptions, IGetTopicNames, IGetTopicStats, TopicStats, Subscription } from "./capabilities.ts";
import type { TopicConfig } from "../../commons/config.ts";
import type { StoredTopic, StoredTopicStats } from "./stored-types.ts";
import { KV_TOPIC, KV_TOPIC_STATS } from "./keys.ts";

class DenoAtomicWriter implements IAtomicWriter {
  private op: Deno.AtomicOperation;

  constructor(op: Deno.AtomicOperation) {
    this.op = op;
  }

  set<StoredValue>(key: string[], value: StoredValue): IAtomicWriter {
    this.op = this.op.set(key, value);
    return this;
  }

  delete(key: string[]): IAtomicWriter {
    this.op = this.op.delete(key);
    return this;
  }

  async commit(): Promise<void> {
    await this.op.commit();
  }
}

export class DenoKVBackend implements IStorageBackend, IGetTopicNames, IGetTopicStats, IGetSubscriptions, ICreateTopics {
  private kv: Deno.Kv | null = null;
  private path: string | undefined;

  constructor(path?: string) {
    this.path = path;
  }

  async init(): Promise<void> {
    this.kv = await Deno.openKv(this.path);
  }

  async close(): Promise<void> {
    this.#assertInitialised();
    this.kv!.close();
  }

  async get<StoredValue>(key: string[]): Promise<StoredValue | null> {
    this.#assertInitialised();
    const entry = await this.kv!.get<StoredValue>(key);
    return entry.value;
  }

  async set<StoredValue>(key: string[], value: StoredValue): Promise<void> {
    this.#assertInitialised();
    await this.kv!.set(key, value);
  }

  async delete(key: string[]): Promise<void> {
    this.#assertInitialised();
    await this.kv!.delete(key);
  }

  async *list<StoredValue>(
    prefix: string[],
    options?: { start?: string[]; limit?: number },
  ): AsyncGenerator<{ key: string[]; value: StoredValue }> {
    this.#assertInitialised();

    const selector: Deno.KvListSelector = options?.start
      ? { prefix, start: options.start }
      : { prefix };

    const kvOptions: Deno.KvListOptions = options?.limit
      ? { limit: options.limit }
      : {};

    for await (const entry of this.kv!.list<StoredValue>(selector, kvOptions)) {
      yield { key: entry.key as string[], value: entry.value };
    }
  }

  atomic(): IAtomicWriter {
    this.#assertInitialised();
    return new DenoAtomicWriter(this.kv!.atomic());
  }

  // -- IGetTopicNames --

  async getTopicNames(): Promise<string[]> {
    this.#assertInitialised();
    const names: string[] = [];
    for await (const entry of this.kv!.list<StoredTopic>({ prefix: KV_TOPIC })) {
      const name = entry.key[1];
      if (typeof name === "string") {
        names.push(name);
      }
    }
    return names;
  }

  // -- IGetTopicStats --

  async getTopicStats(topic: string): Promise<TopicStats | null> {
    this.#assertInitialised();
    const meta = await this.kv!.get<StoredTopic>([...KV_TOPIC, topic]);
    if (!meta.value) {
      return null;
    }
    const stats = await this.kv!.get<StoredTopicStats>([...KV_TOPIC_STATS, topic]);
    return {
      topic,
      stats: {
        count: stats.value?.count ?? 0,
        lastUpdated: stats.value?.lastUpdated ?? meta.value.createdAt,
      },
    };
  }

  // -- IGetSubscriptions --

  async getSubscriptions(): Promise<Subscription[]> {
    return [];
  }

  // -- ICreateTopics --

  async createTopics(events: TopicConfig[], objects: TopicConfig[]): Promise<void> {
    this.#assertInitialised();
    const now = Date.now();
    for (const topic of events) {
      await this.#createTopic(topic, "event", now);
    }
    for (const topic of objects) {
      await this.#createTopic(topic, "object", now);
    }
  }

  async #createTopic(topic: TopicConfig, type: "event" | "object", now: number): Promise<void> {
    const metaKey = [...KV_TOPIC, topic.name];
    const statsKey = [...KV_TOPIC_STATS, topic.name];
    const stored: StoredTopic = { type, schema: topic.schema, createdAt: now };
    const stats: StoredTopicStats = { count: 0, lastUpdated: now };

    // check versionstamp null ensures we only write if the topic does not already exist
    await this.kv!.atomic()
      .check({ key: metaKey, versionstamp: null })
      .set(metaKey, stored)
      .set(statsKey, stats)
      .commit();
  }

  #assertInitialised(): void {
    if (!this.kv) {
      throw new Error("DenoKVBackend has not been initialised; call init() first");
    }
  }
}
