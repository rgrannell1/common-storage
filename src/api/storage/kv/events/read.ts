// Event read operations — readEvent, readEvents, and ID-based batch fetch
// @work.md

import type { EventEntry, ReadEventOptions } from "../../capabilities.ts";
import type { StoredTopic, StoredEvent } from "../../types/stored-types.ts";
import { KV_TOPIC, KV_EVENT } from "../../keys.ts";

export async function readEvent(kv: Deno.Kv, topic: string, id: number): Promise<EventEntry | null> {
  const meta = await kv.get<StoredTopic>([...KV_TOPIC, topic]);
  if (!meta.value) {
    return null;
  }

  const entry = await kv.get<StoredEvent>([...KV_EVENT, topic, id]);
  if (!entry.value) {
    return null;
  }

  return entry.value;
}

async function readEventsByIds(kv: Deno.Kv, topic: string, ids: number[]): Promise<EventEntry[]> {
  const results = await Promise.all(ids.map(id => kv.get<StoredEvent>([...KV_EVENT, topic, id])));
  return results.flatMap(item => item.value !== null ? [item.value] : []);
}

export async function readEvents(kv: Deno.Kv, topic: string, opts: ReadEventOptions): Promise<EventEntry[] | null> {
  const meta = await kv.get<StoredTopic>([...KV_TOPIC, topic]);
  if (!meta.value) {
    return null;
  }

  if (opts.ids !== undefined) {
    return readEventsByIds(kv, topic, opts.ids);
  }

  const prefix = [...KV_EVENT, topic];
  const selector = opts.start !== undefined
    ? { prefix, start: [...KV_EVENT, topic, opts.start] }
    : { prefix };

  const entries: EventEntry[] = [];
  for await (const item of kv.list<StoredEvent>(selector, { limit: opts.size })) {
    entries.push(item.value);
  }
  return entries;
}
