// Event read operations — readEvent, readEvents, and ID-based batch fetch
// @work.md

import type { IStorageBackend } from "../backend.ts";
import type { EventEntry, ReadEventOptions } from "../../capabilities.ts";
import type { StoredTopic, StoredEvent } from "../types/stored-types.ts";
import { KV_TOPIC, KV_EVENT } from "../keys.ts";

export async function readEvent(storage: IStorageBackend, topic: string, id: number): Promise<EventEntry | null> {
  const meta = await storage.get<StoredTopic>([...KV_TOPIC, topic]);
  if (!meta) return null;

  return storage.get<StoredEvent>([...KV_EVENT, topic, id]);
}

async function readEventsByIds(storage: IStorageBackend, topic: string, ids: number[]): Promise<EventEntry[]> {
  const results = await Promise.all(ids.map(id => storage.get<StoredEvent>([...KV_EVENT, topic, id])));
  return results.flatMap(item => item !== null ? [item] : []);
}

export async function readEvents(storage: IStorageBackend, topic: string, opts: ReadEventOptions): Promise<EventEntry[] | null> {
  const meta = await storage.get<StoredTopic>([...KV_TOPIC, topic]);
  if (!meta) return null;

  // Fetch by explicit ID list — bypasses the range selector
  if (opts.ids !== undefined) {
    return readEventsByIds(storage, topic, opts.ids);
  }

  // Range scan: list from start key up to size, or full topic if start is unset
  const prefix = [...KV_EVENT, topic];
  const selector = opts.start !== undefined
    ? { prefix, start: [...KV_EVENT, topic, opts.start] }
    : { prefix };

  const entries: EventEntry[] = [];
  for await (const item of storage.list<StoredEvent>(selector, { limit: opts.size })) {
    entries.push(item.value);
  }
  return entries;
}
