// Topic CRUD — implements IGetTopicNames, IGetTopicStats, IGetSubscriptions, ICreateTopics
// @work.md

import type { IStorageBackend } from "./backend.ts";
import type { TopicConfig } from "../../commons/config.ts";
import type { TopicStats, Subscription } from "../capabilities.ts";
import type { StoredTopic, StoredTopicStats } from "./types/stored-types.ts";
import { KV_TOPIC, KV_TOPIC_STATS } from "./keys.ts";

export async function getTopicNames(storage: IStorageBackend): Promise<string[]> {
  const names: string[] = [];
  for await (const entry of storage.list<StoredTopic>({ prefix: KV_TOPIC })) {
    const name = entry.key[1];
    if (typeof name === "string") {
      names.push(name);
    }
  }
  return names;
}

export async function getTopicStats(storage: IStorageBackend, topic: string): Promise<TopicStats | null> {
  const meta = await storage.get<StoredTopic>([...KV_TOPIC, topic]);
  if (!meta) return null;
  const stats = await storage.get<StoredTopicStats>([...KV_TOPIC_STATS, topic]);
  return {
    topic,
    stats: {
      count: stats?.count ?? 0,
      lastUpdated: stats?.lastUpdated ?? meta.createdAt,
    },
  };
}

export async function getTopicType(storage: IStorageBackend, topic: string): Promise<"event" | "object" | null> {
  const meta = await storage.get<StoredTopic>([...KV_TOPIC, topic]);
  return meta?.type ?? null;
}

export function getSubscriptions(): Promise<Subscription[]> {
  return Promise.resolve([]);
}

export async function createTopics(storage: IStorageBackend, events: TopicConfig[], objects: TopicConfig[]): Promise<void> {
  const now = Date.now();
  for (const topic of events) {
    await createTopic(storage, topic, "event", now);
  }
  for (const topic of objects) {
    await createTopic(storage, topic, "object", now);
  }
}

async function createTopic(storage: IStorageBackend, topic: TopicConfig, type: "event" | "object", now: number): Promise<void> {
  const metaKey = [...KV_TOPIC, topic.name];
  const statsKey = [...KV_TOPIC_STATS, topic.name];
  const stored: StoredTopic = { type, schema: topic.schema, createdAt: now };
  const stats: StoredTopicStats = { count: 0, lastUpdated: now };

  // check versionstamp null ensures we only write if the topic does not already exist.
  // { ok: false } can mean either "topic already exists" (expected no-op) or an unexpected KV
  // error — KV gives no way to distinguish the two, so both are silently discarded here.
  await storage.atomic()
    .check({ key: metaKey, versionstamp: null })
    .set(metaKey, stored)
    .set(statsKey, stats)
    .commit();
}
