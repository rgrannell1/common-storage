// Topic CRUD — implements IGetTopicNames, IGetTopicStats, IGetSubscriptions, ICreateTopics
// @work.md

import type { TopicConfig } from "../../../commons/config.ts";
import type { TopicStats, Subscription } from "../capabilities.ts";
import type { StoredTopic, StoredTopicStats } from "../types/stored-types.ts";
import { KV_TOPIC, KV_TOPIC_STATS } from "../keys.ts";

export async function getTopicNames(kv: Deno.Kv): Promise<string[]> {
  const names: string[] = [];
  for await (const entry of kv.list<StoredTopic>({ prefix: KV_TOPIC })) {
    const name = entry.key[1];
    if (typeof name === "string") {
      names.push(name);
    }
  }
  return names;
}

export async function getTopicStats(kv: Deno.Kv, topic: string): Promise<TopicStats | null> {
  const meta = await kv.get<StoredTopic>([...KV_TOPIC, topic]);
  if (!meta.value) {
    return null;
  }
  const stats = await kv.get<StoredTopicStats>([...KV_TOPIC_STATS, topic]);
  return {
    topic,
    stats: {
      count: stats.value?.count ?? 0,
      lastUpdated: stats.value?.lastUpdated ?? meta.value.createdAt,
    },
  };
}

export async function getSubscriptions(): Promise<Subscription[]> {
  return [];
}

export async function createTopics(kv: Deno.Kv, events: TopicConfig[], objects: TopicConfig[]): Promise<void> {
  const now = Date.now();
  for (const topic of events) {
    await createTopic(kv, topic, "event", now);
  }
  for (const topic of objects) {
    await createTopic(kv, topic, "object", now);
  }
}

async function createTopic(kv: Deno.Kv, topic: TopicConfig, type: "event" | "object", now: number): Promise<void> {
  const metaKey = [...KV_TOPIC, topic.name];
  const statsKey = [...KV_TOPIC_STATS, topic.name];
  const stored: StoredTopic = { type, schema: topic.schema, createdAt: now };
  const stats: StoredTopicStats = { count: 0, lastUpdated: now };

  // check versionstamp null ensures we only write if the topic does not already exist
  await kv.atomic()
    .check({ key: metaKey, versionstamp: null })
    .set(metaKey, stored)
    .set(statsKey, stats)
    .commit();
}
