// CommonStorageNode — the single interface for all data access in Common Storage.
// Backed by any ILocalBackend; wraps local reads/writes and drives sync against pinned remotes.

import type { ILocalBackend } from "../storage/backend.ts";
import type { EventEntry, ReadEventOptions, ObjectEntry } from "../storage/capabilities.ts";
import { syncEventTopic, syncObjectTopic } from "./sync.ts";
import type { ChangeEvent } from "./sync.ts";
export type { ChangeEvent };

// Scheduler interface — injected so Deno.cron vs setInterval never appear in core.
export interface IScheduler {
  schedule(id: string, intervalMs: number, fn: () => Promise<void>): void;
  cancelAll(): void;
}

// A declared subscription: which remote topic to sync, how often, and with which token.
export type SubscriptionDeclaration = {
  topic: string;
  topicType: "event" | "object";
  remoteUrl: string;
  token: string;
  // Sync frequency in milliseconds
  intervalMs: number;
};

export class CommonStorageNode {
  private readonly subscriptions: SubscriptionDeclaration[];
  private readonly watchers: Map<string, Array<(event: ChangeEvent) => void>> = new Map();

  constructor(
    private readonly backend: ILocalBackend,
    private readonly scheduler: IScheduler,
    subscriptions: SubscriptionDeclaration[] = [],
  ) {
    this.subscriptions = subscriptions;
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
        ? await syncEventTopic(this.backend, sub.remoteUrl, sub.token, topic)
        : await syncObjectTopic(this.backend, sub.remoteUrl, sub.token, topic);
      for (const change of changes) this.#emit(change);
    } catch {
      // Sync errors are non-fatal; the next scheduled cycle will retry
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
      this.#emit({ type: "upsert", topic, entry });
      await this.#pushEvent(topic, "POST", payload);
    }
    return entry;
  }

  async putEvent(topic: string, id: number, payload: unknown): Promise<EventEntry | null> {
    const result = await this.backend.events.updateEvent(topic, id, payload);
    if (result) {
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
    await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${sub.token}` },
      body: JSON.stringify({ payload }),
    }).catch(() => {
      // Remote push failure is non-fatal; sync will reconcile on the next cycle
    });
  }

  async #pushObject(topic: string, id: string, method: "PUT" | "DELETE", payload?: unknown): Promise<void> {
    const sub = this.subscriptions.find(declared => declared.topic === topic);
    if (!sub) return;
    const url = `${sub.remoteUrl}/objects/${topic}/${id}`;
    await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${sub.token}` },
      body: method === "PUT" ? JSON.stringify({ payload }) : undefined,
    }).catch(() => {
      // Remote push failure is non-fatal; sync will reconcile on the next cycle
    });
  }
}
