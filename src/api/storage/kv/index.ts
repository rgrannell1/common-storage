// DenoKVBackend — assembles all capability implementations; delegates to domain modules
// @work.md

import type { IAtomicWriter, IStorageBackend } from "../backend.ts";
import type { ICreateTopics, IGetSubscriptions, IGetTopicNames, IGetTopicStats, IGetTopicType, IWriteEvent, IReadEvents, IReadEvent, IUpdateEvent, IStreamEvents, IDiffEvents, EventDiffRequest, EventDiffResult, UpdateEventTimestamps, IUpsertObject, IReadObject, IDeleteObject, IReadObjects, IDiffObjects, ISweepTombstones, ObjectDiffRequest, ObjectDiffResult, IReadIdempotencyEntry, IWriteIdempotencyEntry, TopicStats, Subscription, EventEntry, ReadEventOptions, ObjectEntry } from "../capabilities.ts";
import type { TopicConfig } from "../../../commons/config.ts";
import { kvGet, kvSet, kvSetWithExpiry, kvDelete, kvList, kvAtomic } from "./base.ts";
import * as Topics from "./topics.ts";
import * as Events from "./events/index.ts";
import * as Objects from "./objects.ts";
import * as Idempotency from "./idempotency.ts";

export class DenoKVBackend implements IStorageBackend, IGetTopicNames, IGetTopicStats, IGetSubscriptions, IGetTopicType, ICreateTopics, IWriteEvent, IReadEvents, IReadEvent, IUpdateEvent, IStreamEvents, IDiffEvents, IUpsertObject, IReadObject, IDeleteObject, IReadObjects, IDiffObjects, ISweepTombstones, IReadIdempotencyEntry, IWriteIdempotencyEntry {
  private kv: Deno.Kv | null = null;
  private path: string | undefined;

  constructor(path?: string) {
    this.path = path;
  }

  async init(): Promise<void> {
    this.kv = await Deno.openKv(this.path);
  }

  close(): Promise<void> {
    this.#assertInitialised();
    this.kv!.close();
    return Promise.resolve();
  }

  get<StoredValue>(key: string[]): Promise<StoredValue | null> {
    this.#assertInitialised();
    return kvGet<StoredValue>(this.kv!, key);
  }

  set<StoredValue>(key: string[], value: StoredValue): Promise<void> {
    this.#assertInitialised();
    return kvSet<StoredValue>(this.kv!, key, value);
  }

  setWithExpiry<StoredValue>(key: string[], value: StoredValue, expireInMs: number): Promise<void> {
    this.#assertInitialised();
    return kvSetWithExpiry<StoredValue>(this.kv!, key, value, expireInMs);
  }

  delete(key: string[]): Promise<void> {
    this.#assertInitialised();
    return kvDelete(this.kv!, key);
  }

  async *list<StoredValue>(
    prefix: string[],
    options?: { start?: string[]; limit?: number },
  ): AsyncGenerator<{ key: string[]; value: StoredValue }> {
    this.#assertInitialised();
    yield* kvList<StoredValue>(this.kv!, prefix, options);
  }

  atomic(): IAtomicWriter {
    this.#assertInitialised();
    return kvAtomic(this.kv!);
  }

  // -- IGetTopicType --

  getTopicType(topic: string): Promise<"event" | "object" | null> {
    this.#assertInitialised();
    return Topics.getTopicType(this.kv!, topic);
  }

  // -- IGetTopicNames --

  getTopicNames(): Promise<string[]> {
    this.#assertInitialised();
    return Topics.getTopicNames(this.kv!);
  }

  // -- IGetTopicStats --

  getTopicStats(topic: string): Promise<TopicStats | null> {
    this.#assertInitialised();
    return Topics.getTopicStats(this.kv!, topic);
  }

  // -- IGetSubscriptions --

  getSubscriptions(): Promise<Subscription[]> {
    return Topics.getSubscriptions();
  }

  // -- ICreateTopics --

  createTopics(events: TopicConfig[], objects: TopicConfig[]): Promise<void> {
    this.#assertInitialised();
    return Topics.createTopics(this.kv!, events, objects);
  }

  // -- IWriteEvent --

  writeEvent(topic: string, payload: unknown): Promise<EventEntry | null> {
    this.#assertInitialised();
    return Events.writeEvent(this.kv!, topic, payload);
  }

  // -- IReadEvents --

  readEvents(topic: string, opts: ReadEventOptions): Promise<EventEntry[] | null> {
    this.#assertInitialised();
    return Events.readEvents(this.kv!, topic, opts);
  }

  // -- IStreamEvents --

  async *streamEvents(topic: string, startId: number, signal: AbortSignal): AsyncGenerator<EventEntry> {
    this.#assertInitialised();
    yield* Events.streamEvents(this.kv!, topic, startId, signal);
  }

  // -- IReadEvent --

  readEvent(topic: string, id: number): Promise<EventEntry | null> {
    this.#assertInitialised();
    return Events.readEvent(this.kv!, topic, id);
  }

  // -- IUpdateEvent --

  updateEvent(topic: string, id: number, payload: unknown, timestamps?: UpdateEventTimestamps): Promise<{ entry: EventEntry; created: boolean } | null> {
    this.#assertInitialised();
    return Events.updateEvent(this.kv!, topic, id, payload, timestamps);
  }

  // -- IDiffEvents --

  diffEvents(topic: string, req: EventDiffRequest): Promise<EventDiffResult | null> {
    this.#assertInitialised();
    return Events.diffEvents(this.kv!, topic, req);
  }

  // -- IUpsertObject --

  upsertObject(topic: string, id: string, payload: unknown): Promise<ObjectEntry | null> {
    this.#assertInitialised();
    return Objects.upsertObject(this.kv!, topic, id, payload);
  }

  // -- IReadObject --

  readObject(topic: string, id: string): Promise<ObjectEntry | null> {
    this.#assertInitialised();
    return Objects.readObject(this.kv!, topic, id);
  }

  // -- IDeleteObject --

  deleteObject(topic: string, id: string): Promise<ObjectEntry | null> {
    this.#assertInitialised();
    return Objects.deleteObject(this.kv!, topic, id);
  }

  // -- IDiffObjects --

  diffObjects(topic: string, req: ObjectDiffRequest): Promise<ObjectDiffResult | null> {
    this.#assertInitialised();
    return Objects.diffObjects(this.kv!, topic, req);
  }

  // -- IReadObjects --

  readObjects(topic: string): Promise<ObjectEntry[] | null> {
    this.#assertInitialised();
    return Objects.readObjects(this.kv!, topic);
  }

  // -- ISweepTombstones --

  sweepTombstones(topic: string): Promise<void> {
    this.#assertInitialised();
    return Objects.sweepTombstones(this.kv!, topic);
  }

  // -- IReadIdempotencyEntry --

  readIdempotencyEntry(namespace: string, topic: string, key: string): Promise<unknown | null> {
    this.#assertInitialised();
    return Idempotency.readIdempotencyEntry(this.kv!, namespace, topic, key);
  }

  // -- IWriteIdempotencyEntry --

  writeIdempotencyEntry(namespace: string, topic: string, key: string, entry: unknown): Promise<void> {
    this.#assertInitialised();
    return Idempotency.writeIdempotencyEntry(this.kv!, namespace, topic, key, entry);
  }

  #assertInitialised(): void {
    if (!this.kv) {
      throw new Error("DenoKVBackend has not been initialised; call init() first");
    }
  }
}
