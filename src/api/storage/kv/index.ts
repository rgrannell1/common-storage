// DenoKVBackend — assembles all capability implementations; delegates to domain modules
// @work.md

import type { IAtomicWriter, IStorageBackend } from "../backend.ts";
import type { ICreateTopics, IGetSubscriptions, IGetTopicNames, IGetTopicStats, IWriteEvent, IReadEvents, IReadEvent, IUpdateEvent, IStreamEvents, IUpsertObject, IReadObject, IDeleteObject, IReadObjects, IReadIdempotencyEntry, IWriteIdempotencyEntry, TopicStats, Subscription, EventEntry, ReadEventOptions, ObjectEntry } from "../capabilities.ts";
import type { TopicConfig } from "../../../commons/config.ts";
import { DenoAtomicWriter } from "./atomic.ts";
import * as Topics from "./topics.ts";
import * as Events from "./events.ts";
import * as Objects from "./objects.ts";
import * as Idempotency from "./idempotency.ts";

export class DenoKVBackend implements IStorageBackend, IGetTopicNames, IGetTopicStats, IGetSubscriptions, ICreateTopics, IWriteEvent, IReadEvents, IReadEvent, IUpdateEvent, IStreamEvents, IUpsertObject, IReadObject, IDeleteObject, IReadObjects, IReadIdempotencyEntry, IWriteIdempotencyEntry {
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

  // -- IWriteEvent --

  async writeEvent(topic: string, payload: unknown): Promise<EventEntry | null> {
    this.#assertInitialised();
    return Events.writeEvent(this.kv!, topic, payload);
  }

  // -- IReadEvents --

  async readEvents(topic: string, opts: ReadEventOptions): Promise<EventEntry[] | null> {
    this.#assertInitialised();
    return Events.readEvents(this.kv!, topic, opts);
  }

  // -- IStreamEvents --

  async *streamEvents(topic: string, startId: number, signal: AbortSignal): AsyncGenerator<EventEntry> {
    this.#assertInitialised();
    yield* Events.streamEvents(this.kv!, topic, startId, signal);
  }

  // -- IReadEvent --

  async readEvent(topic: string, id: number): Promise<EventEntry | null> {
    this.#assertInitialised();
    return Events.readEvent(this.kv!, topic, id);
  }

  // -- IUpdateEvent --

  async updateEvent(topic: string, id: number, payload: unknown): Promise<EventEntry | null> {
    this.#assertInitialised();
    return Events.updateEvent(this.kv!, topic, id, payload);
  }

  // -- IUpsertObject --

  async upsertObject(topic: string, id: string, payload: unknown): Promise<ObjectEntry | null> {
    this.#assertInitialised();
    return Objects.upsertObject(this.kv!, topic, id, payload);
  }

  // -- IReadObject --

  async readObject(topic: string, id: string): Promise<ObjectEntry | null> {
    this.#assertInitialised();
    return Objects.readObject(this.kv!, topic, id);
  }

  // -- IDeleteObject --

  async deleteObject(topic: string, id: string): Promise<ObjectEntry | null> {
    this.#assertInitialised();
    return Objects.deleteObject(this.kv!, topic, id);
  }

  // -- IReadObjects --

  async readObjects(topic: string): Promise<ObjectEntry[] | null> {
    this.#assertInitialised();
    return Objects.readObjects(this.kv!, topic);
  }

  // -- IReadIdempotencyEntry --

  async readIdempotencyEntry(topic: string, key: string): Promise<unknown | null> {
    this.#assertInitialised();
    return Idempotency.readIdempotencyEntry(this.kv!, topic, key);
  }

  // -- IWriteIdempotencyEntry --

  async writeIdempotencyEntry(topic: string, key: string, entry: unknown): Promise<void> {
    this.#assertInitialised();
    return Idempotency.writeIdempotencyEntry(this.kv!, topic, key, entry);
  }

  #assertInitialised(): void {
    if (!this.kv) {
      throw new Error("DenoKVBackend has not been initialised; call init() first");
    }
  }
}
