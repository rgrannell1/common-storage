// CommonStorageNode — the single interface for all data access in Common Storage.
// Backed by any ISyncBackend; wraps local reads/writes and drives sync against pinned remotes.

import type { ISyncBackend } from "../storage/backend.ts";
import type { EventEntry, ReadEventOptions, ObjectEntry } from "../storage/capabilities.ts";
import { syncEventTopic, syncObjectTopic } from "./sync.ts";
import type { ChangeEvent } from "./sync.ts";
import type { ILogger } from "../commons/logger.ts";
import { NoopLogger } from "../commons/logger.ts";
export type { ChangeEvent };

// Scheduler interface — injected so Deno.cron vs setInterval never appear in core.
export interface IScheduler {
  schedule(id: string, intervalMs: number, fn: () => Promise<void>): void;
  cancelAll(): void;
}

export type EventSubscription = {
  topic: string;
  remoteUrl: string;
  token: string;
  intervalMs: number;
  // How long to tail the NDJSON stream after each diff round-trip (ms). Defaults to TAIL_DURATION_MS.
  tailDurationMs?: number;
};

export type ObjectSubscription = {
  topic: string;
  remoteUrl: string;
  token: string;
  intervalMs: number;
};

export type NodeServices = {
  backend: ISyncBackend;
  scheduler: IScheduler;
  // Defaults to NoopLogger when omitted
  logger?: ILogger;
};

export type NodeSubscriptions = {
  events?: EventSubscription[];
  objects?: ObjectSubscription[];
};

// Internal tagged union used for dispatch after construction
type TaggedSubscription =
  | ({ topicType: "event" } & EventSubscription)
  | ({ topicType: "object" } & ObjectSubscription);

export class CommonStorageNode {
  private readonly backend: ISyncBackend;
  private readonly scheduler: IScheduler;
  private readonly logger: ILogger;
  private readonly subscriptions: TaggedSubscription[];
  private readonly watchers: Map<string, Array<(event: ChangeEvent) => void>> = new Map();

  constructor(services: NodeServices, subscriptions: NodeSubscriptions = {}) {
    this.backend = services.backend;
    this.scheduler = services.scheduler;
    this.logger = services.logger ?? new NoopLogger();

    const events = (subscriptions.events ?? []).map(sub => ({ topicType: "event" as const, ...sub }));
    const objects = (subscriptions.objects ?? []).map(sub => ({ topicType: "object" as const, ...sub }));
    this.subscriptions = [...events, ...objects];
  }

  // -- Lifecycle --

  start(): void {
    for (const sub of this.subscriptions) {
      this.scheduler.schedule(`cmstr-sync-${sub.topic}`, sub.intervalMs, () => this.sync(sub.topic));
    }
  }

  stop(): void {
    this.scheduler.cancelAll();
  }

  // -- Sync (also callable manually) --

  async sync(topic: string): Promise<void> {
    const sub = this.subscriptions.find(declared => declared.topic === topic);
    if (!sub) return;
    if (!sub.token) return;

    try {
      const changes = sub.topicType === "event"
        ? await syncEventTopic(this.backend, sub.remoteUrl, sub.token, topic, sub.tailDurationMs)
        : await syncObjectTopic(this.backend, sub.remoteUrl, sub.token, topic);
      for (const change of changes) this.#emit(change);
    } catch (err) {
      this.logger.error("sync failed", undefined, { topic, error: String(err) });
    }
  }

  // -- Event topic reads --

  getEvent(topic: string, id: number): Promise<EventEntry | null> {
    return this.backend.events.readEvent(topic, id);
  }

  getEvents(topic: string, opts: ReadEventOptions = {}): Promise<EventEntry[] | null> {
    return this.backend.events.readEvents(topic, opts);
  }

  // -- Event topic writes (optimistic: local first, then push to remote) --

  async postEvent(topic: string, payload: unknown): Promise<EventEntry | null> {
    const entry = await this.backend.events.writeEvent(topic, payload);
    if (entry) {
      await this.backend.merkleEvents?.invalidatePath(topic, entry.id);
      this.#emit({ type: "upsert", topic, entry });
      await this.#pushEvent(topic, "POST", payload);
    }
    return entry;
  }

  async putEvent(topic: string, id: number, payload: unknown): Promise<EventEntry | null> {
    const result = await this.backend.events.updateEvent(topic, id, payload);
    if (result) {
      await this.backend.merkleEvents?.invalidatePath(topic, result.entry.id);
      this.#emit({ type: "upsert", topic, entry: result.entry });
      await this.#pushEvent(topic, "PUT", payload, id);
    }
    return result?.entry ?? null;
  }

  // -- Object topic reads --

  getObject(topic: string, id: string): Promise<ObjectEntry | null> {
    return this.backend.objects.readObject(topic, id);
  }

  getObjects(topic: string, opts: { start?: number; size?: number } = {}): Promise<ObjectEntry[] | null> {
    return this.backend.objects.readObjectsBySeq(topic, opts);
  }

  // -- Object topic writes (optimistic: local first, then push to remote) --

  async putObject(topic: string, id: string, payload: unknown): Promise<ObjectEntry | null> {
    const entry = await this.backend.objects.upsertObject(topic, id, payload);
    if (entry) {
      this.#emit({ type: "upsert", topic, entry });
      await this.#pushObject(topic, id, "PUT", payload);
    }
    return entry;
  }

  async deleteObject(topic: string, id: string): Promise<ObjectEntry | null> {
    const entry = await this.backend.objects.deleteObject(topic, id);
    if (entry) {
      this.#emit({ type: "delete", topic, id });
      await this.#pushObject(topic, id, "DELETE");
    }
    return entry;
  }

  // -- Change observation --

  // Async generator that yields ChangeEvents as they are emitted by writes and incoming sync.
  async *watch(topic: string): AsyncGenerator<ChangeEvent> {
    const queue: ChangeEvent[] = [];
    let resolve: (() => void) | null = null;

    const handler = (event: ChangeEvent) => {
      queue.push(event);
      resolve?.();
      resolve = null;
    };

    if (!this.watchers.has(topic)) this.watchers.set(topic, []);
    this.watchers.get(topic)!.push(handler);

    try {
      while (true) {
        while (queue.length > 0) yield queue.shift()!;
        await new Promise<void>(res => { resolve = res; });
      }
    } finally {
      const handlers = this.watchers.get(topic);
      if (handlers) {
        const idx = handlers.indexOf(handler);
        if (idx !== -1) handlers.splice(idx, 1);
      }
    }
  }

  // -- Internal --

  #emit(event: ChangeEvent): void {
    const handlers = this.watchers.get(event.topic) ?? [];
    for (const handler of handlers) handler(event);
  }

  async #pushEvent(topic: string, method: "POST" | "PUT", payload: unknown, id?: number): Promise<void> {
    const sub = this.subscriptions.find(declared => declared.topic === topic);
    if (!sub) return;
    const url = method === "POST"
      ? `${sub.remoteUrl}/events/${topic}`
      : `${sub.remoteUrl}/events/${topic}/${id}`;
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${sub.token}` },
      body: JSON.stringify({ payload }),
    }).catch(err => {
      this.logger.error("event push failed", undefined, { topic, method, error: String(err) });
      return null;
    });
    await res?.body?.cancel();
  }

  async #pushObject(topic: string, id: string, method: "PUT" | "DELETE", payload?: unknown): Promise<void> {
    const sub = this.subscriptions.find(declared => declared.topic === topic);
    if (!sub) return;
    const url = `${sub.remoteUrl}/objects/${topic}/${id}`;
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${sub.token}` },
      body: method === "PUT" ? JSON.stringify({ payload }) : undefined,
    }).catch(err => {
      this.logger.error("object push failed", undefined, { topic, id, method, error: String(err) });
      return null;
    });
    await res?.body?.cancel();
  }
}
