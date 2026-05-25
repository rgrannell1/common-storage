// DenoKVBackend — raw KV primitives + composer that wires the four service stores into IFullStorage.
// Also implements ILocalBackend so it can be used directly with CommonStorageNode.
// @work.md

import type { IAtomicWriter, IStorageBackend } from "./backend.ts";
import type { IFullStorage, TopicStats, Subscription, EventEntry, ReadEventOptions, UpdateEventTimestamps, EventDiffRequest, EventDiffResult, ObjectEntry, ObjectDiffRequest, ObjectDiffResult } from "../capabilities.ts";
import type { ILocalBackend, ILocalEventStore, ILocalObjectStore } from "../backend.ts";
import type { ICursorStore } from "../backend.ts";
import type { TopicConfig } from "../../commons/config.ts";
import { kvGet, kvGetEntry, kvSet, kvSetWithExpiry, kvDelete, kvList, kvAtomic } from "./base.ts";
import { KvOpsCounter } from "./ops.ts";
import { KvTopicStore } from "./topic-store.ts";
import { KvEventStore } from "./event-store.ts";
import { KvObjectStore } from "./object-store.ts";
import { KvIdempotencyStore } from "./idempotency-store.ts";
import { KvCursorStore } from "./cursor-store.ts";

export { KvOpsCounter } from "./ops.ts";

export class DenoKVBackend implements IStorageBackend, IFullStorage, ILocalBackend {
  private kv: Deno.Kv | null = null;
  private path: string | undefined;
  private ops: KvOpsCounter | null;
  private readonly topicStore: KvTopicStore;
  private readonly eventStore: KvEventStore;
  private readonly objectStore: KvObjectStore;
  private readonly idempotencyStore: KvIdempotencyStore;
  readonly cursors: ICursorStore;

  // ILocalBackend sub-stores — expose event/object stores under the narrow ILocalBackend interface
  get events(): ILocalEventStore { return this.eventStore; }
  get objects(): ILocalObjectStore { return this.objectStore; }

  constructor(path?: string, ops?: KvOpsCounter) {
    this.path = path;
    this.ops = ops ?? null;
    // Sub-stores receive `this` as IStorageBackend. Their constructors must not call any storage
    // method — this.kv is null until init() resolves, so any early call would throw.
    this.topicStore = new KvTopicStore(this);
    this.eventStore = new KvEventStore(this);
    this.objectStore = new KvObjectStore(this);
    this.idempotencyStore = new KvIdempotencyStore(this);
    this.cursors = new KvCursorStore(this);
  }

  async init(): Promise<void> {
    this.kv = await Deno.openKv(this.path);
  }

  close(): Promise<void> {
    this.#assertInitialised();
    this.kv!.close();
    return Promise.resolve();
  }

  // -- IStorageBackend primitives --

  get<Value>(key: readonly Deno.KvKeyPart[]): Promise<Value | null> {
    this.#assertInitialised();
    if (this.ops) this.ops.reads++;
    return kvGet<Value>(this.kv!, key);
  }

  getEntry<Value>(key: readonly Deno.KvKeyPart[]): Promise<Deno.KvEntryMaybe<Value>> {
    this.#assertInitialised();
    if (this.ops) this.ops.reads++;
    return kvGetEntry<Value>(this.kv!, key);
  }

  set<Value>(key: readonly Deno.KvKeyPart[], value: Value): Promise<void> {
    this.#assertInitialised();
    if (this.ops) this.ops.writes++;
    return kvSet<Value>(this.kv!, key, value);
  }

  setWithExpiry<Value>(key: readonly Deno.KvKeyPart[], value: Value, expireInMs: number): Promise<void> {
    this.#assertInitialised();
    if (this.ops) this.ops.writes++;
    return kvSetWithExpiry<Value>(this.kv!, key, value, expireInMs);
  }

  delete(key: readonly Deno.KvKeyPart[]): Promise<void> {
    this.#assertInitialised();
    if (this.ops) this.ops.writes++;
    return kvDelete(this.kv!, key);
  }

  async *list<Value>(selector: Deno.KvListSelector, options?: { limit?: number }): AsyncGenerator<Deno.KvEntry<Value>> {
    this.#assertInitialised();
    if (this.ops) this.ops.lists++;
    for await (const item of kvList<Value>(this.kv!, selector, options)) {
      if (this.ops) this.ops.listItems++;
      yield item;
    }
  }

  atomic(): IAtomicWriter {
    this.#assertInitialised();
    return kvAtomic(this.kv!, this.ops ?? undefined);
  }

  // -- ITopicService --

  getTopicType(topic: string): Promise<"event" | "object" | null> {
    return this.topicStore.getTopicType(topic);
  }

  getTopicNames(): Promise<string[]> {
    return this.topicStore.getTopicNames();
  }

  getTopicStats(topic: string): Promise<TopicStats | null> {
    return this.topicStore.getTopicStats(topic);
  }

  getSubscriptions(): Promise<Subscription[]> {
    return this.topicStore.getSubscriptions();
  }

  createTopics(events: TopicConfig[], objects: TopicConfig[]): Promise<void> {
    return this.topicStore.createTopics(events, objects);
  }

  // -- IEventService --

  writeEvent(topic: string, payload: unknown): Promise<EventEntry | null> {
    return this.eventStore.writeEvent(topic, payload);
  }

  readEvents(topic: string, opts: ReadEventOptions): Promise<EventEntry[] | null> {
    return this.eventStore.readEvents(topic, opts);
  }

  readEvent(topic: string, id: number): Promise<EventEntry | null> {
    return this.eventStore.readEvent(topic, id);
  }

  updateEvent(topic: string, id: number, payload: unknown, timestamps?: UpdateEventTimestamps): Promise<{ entry: EventEntry; created: boolean } | null> {
    return this.eventStore.updateEvent(topic, id, payload, timestamps);
  }

  async *streamEvents(topic: string, startId: number, signal: AbortSignal): AsyncGenerator<EventEntry> {
    yield* this.eventStore.streamEvents(topic, startId, signal);
  }

  diffEvents(topic: string, req: EventDiffRequest): Promise<EventDiffResult | null> {
    return this.eventStore.diffEvents(topic, req);
  }

  // -- IObjectService --

  upsertObject(topic: string, id: string, payload: unknown, timestamps?: { createdAt?: number; updatedAt?: number; seq?: number }): Promise<ObjectEntry | null> {
    return this.objectStore.upsertObject(topic, id, payload, timestamps);
  }

  readObject(topic: string, id: string): Promise<ObjectEntry | null> {
    return this.objectStore.readObject(topic, id);
  }

  deleteObject(topic: string, id: string, timestamps?: { createdAt?: number; updatedAt?: number; seq?: number }): Promise<ObjectEntry | null> {
    return this.objectStore.deleteObject(topic, id, timestamps);
  }

  readObjects(topic: string): Promise<ObjectEntry[] | null> {
    return this.objectStore.readObjects(topic);
  }

  readObjectsBySeq(topic: string, opts: { start?: number; size?: number }): Promise<ObjectEntry[] | null> {
    return this.objectStore.readObjectsBySeq(topic, opts);
  }

  async *streamObjects(topic: string, startSeq: number, signal: AbortSignal): AsyncGenerator<ObjectEntry> {
    yield* this.objectStore.streamObjects(topic, startSeq, signal);
  }

  diffObjects(topic: string, req: ObjectDiffRequest): Promise<ObjectDiffResult | null> {
    return this.objectStore.diffObjects(topic, req);
  }

  sweepTombstones(topic: string, cutoff?: number): Promise<void> {
    return this.objectStore.sweepTombstones(topic, cutoff);
  }

  // -- IIdempotencyService --

  readIdempotencyEntry(namespace: string, topic: string, key: string): Promise<unknown | null> {
    return this.idempotencyStore.readIdempotencyEntry(namespace, topic, key);
  }

  writeIdempotencyEntry(namespace: string, topic: string, key: string, entry: unknown): Promise<void> {
    return this.idempotencyStore.writeIdempotencyEntry(namespace, topic, key, entry);
  }

  #assertInitialised(): void {
    if (!this.kv) {
      throw new Error("DenoKVBackend has not been initialised; call init() first");
    }
  }
}
