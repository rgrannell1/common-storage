// Content read/write — implements IWriteContent, IReadContent
// @design.md

import type { ContentEntry, ReadContentOptions } from "../capabilities.ts";
import type { StoredTopic, StoredTopicStats, StoredEntry } from "../stored-types.ts";
import { KV_TOPIC, KV_TOPIC_STATS, KV_CONTENT, KV_CONTENT_COUNTER } from "../keys.ts";

export async function writeContent(kv: Deno.Kv, topic: string, payload: unknown): Promise<ContentEntry | null> {
  const meta = await kv.get<StoredTopic>([...KV_TOPIC, topic]);
  if (!meta.value) {
    return null;
  }

  // Atomically claim the next ID by checking the counter versionstamp and retrying on conflict.
  while (true) {
    const counter = await kv.get<number>([...KV_CONTENT_COUNTER, topic]);
    const stats = await kv.get<StoredTopicStats>([...KV_TOPIC_STATS, topic]);
    const id = (counter.value ?? 0) + 1;
    const now = Date.now();

    const entry: StoredEntry = { id, createdAt: now, updatedAt: now, payload };
    const newStats: StoredTopicStats = { count: (stats.value?.count ?? 0) + 1, lastUpdated: now };

    const result = await kv.atomic()
      .check(counter)
      .check(stats)
      .set([...KV_CONTENT_COUNTER, topic], id)
      .set([...KV_CONTENT, topic, id], entry)
      .set([...KV_TOPIC_STATS, topic], newStats)
      .commit();

    if (result.ok) {
      return entry;
    }
  }
}

export async function readContent(kv: Deno.Kv, topic: string, opts: ReadContentOptions): Promise<ContentEntry[] | null> {
  const meta = await kv.get<StoredTopic>([...KV_TOPIC, topic]);
  if (!meta.value) {
    return null;
  }

  const prefix = [...KV_CONTENT, topic];
  const selector = opts.start !== undefined
    ? { prefix, start: [...KV_CONTENT, topic, opts.start] }
    : { prefix };

  const entries: ContentEntry[] = [];
  for await (const item of kv.list<StoredEntry>(selector, { limit: opts.size })) {
    entries.push(item.value);
  }
  return entries;
}
