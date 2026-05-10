// DenoKVBackend — assembles all capability implementations; delegates to domain modules
// @design.md

import type { IAtomicWriter, IStorageBackend } from "../backend.ts";
import type { ICreateTopics, IGetSubscriptions, IGetTopicNames, IGetTopicStats, IWriteContent, IReadContent, TopicStats, Subscription, ContentEntry, ReadContentOptions } from "../capabilities.ts";
import type { TopicConfig } from "../../../commons/config.ts";
import { DenoAtomicWriter } from "./atomic.ts";
import * as Topics from "./topics.ts";
import * as Content from "./content.ts";

export class DenoKVBackend implements IStorageBackend, IGetTopicNames, IGetTopicStats, IGetSubscriptions, ICreateTopics, IWriteContent, IReadContent {
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
    return Topics.getTopicNames(this.kv!);
  }

  // -- IGetTopicStats --

  async getTopicStats(topic: string): Promise<TopicStats | null> {
    this.#assertInitialised();
    return Topics.getTopicStats(this.kv!, topic);
  }

  // -- IGetSubscriptions --

  async getSubscriptions(): Promise<Subscription[]> {
    return Topics.getSubscriptions();
  }

  // -- ICreateTopics --

  async createTopics(events: TopicConfig[], objects: TopicConfig[]): Promise<void> {
    this.#assertInitialised();
    return Topics.createTopics(this.kv!, events, objects);
  }

  // -- IWriteContent --

  async writeContent(topic: string, payload: unknown): Promise<ContentEntry | null> {
    this.#assertInitialised();
    return Content.writeContent(this.kv!, topic, payload);
  }

  // -- IReadContent --

  async readContent(topic: string, opts: ReadContentOptions): Promise<ContentEntry[] | null> {
    this.#assertInitialised();
    return Content.readContent(this.kv!, topic, opts);
  }

  #assertInitialised(): void {
    if (!this.kv) {
      throw new Error("DenoKVBackend has not been initialised; call init() first");
    }
  }
}
