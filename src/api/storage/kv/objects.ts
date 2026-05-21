// Object topic read/write — implements IUpsertObject, IReadObject, IDeleteObject, IReadObjects
// @work.md

import type { ObjectEntry, ObjectDiffRequest, ObjectDiffResult } from "../capabilities.ts";
import { hashUpdatedAt } from "./hashing.ts";
import type { StoredTopic, StoredTopicStats, StoredObject } from "../types/stored-types.ts";
import { KV_TOPIC, KV_TOPIC_STATS, KV_OBJECT } from "../keys.ts";

export async function upsertObject(kv: Deno.Kv, topic: string, id: string, payload: unknown): Promise<ObjectEntry | null> {
  const meta = await kv.get<StoredTopic>([...KV_TOPIC, topic]);
  if (!meta.value) {
    return null;
  }

  while (true) {
    const existing = await kv.get<StoredObject>([...KV_OBJECT, topic, id]);
    const stats = await kv.get<StoredTopicStats>([...KV_TOPIC_STATS, topic]);
    const now = Date.now();
    const isNew = existing.value === null;

    const entry: StoredObject = {
      id,
      createdAt: existing.value?.createdAt ?? now,
      updatedAt: now,
      payload,
    };
    const newStats: StoredTopicStats = {
      count: (stats.value?.count ?? 0) + (isNew ? 1 : 0),
      lastUpdated: now,
    };

    const result = await kv.atomic()
      .check(existing)
      .check(stats)
      .set([...KV_OBJECT, topic, id], entry)
      .set([...KV_TOPIC_STATS, topic], newStats)
      .commit();

    if (result.ok) {
      return entry;
    }
  }
}

export async function deleteObject(kv: Deno.Kv, topic: string, id: string): Promise<ObjectEntry | null> {
  const meta = await kv.get<StoredTopic>([...KV_TOPIC, topic]);
  if (!meta.value) {
    return null;
  }

  while (true) {
    const existing = await kv.get<StoredObject>([...KV_OBJECT, topic, id]);
    const stats = await kv.get<StoredTopicStats>([...KV_TOPIC_STATS, topic]);
    const now = Date.now();
    const tombstone: StoredObject = {
      id,
      createdAt: existing.value?.createdAt ?? now,
      updatedAt: now,
      payload: null,
    };
    const newStats: StoredTopicStats = {
      // deleting a never-written key must not inflate the count
      count: stats.value?.count ?? 0,
      lastUpdated: now,
    };

    const result = await kv.atomic()
      .check(existing)
      .check(stats)
      .set([...KV_OBJECT, topic, id], tombstone)
      .set([...KV_TOPIC_STATS, topic], newStats)
      .commit();

    if (result.ok) {
      return tombstone;
    }
  }
}

function buildClientHashMap(entries: ObjectDiffRequest["entries"]): Map<string, string> {
  return new Map(entries.map(entry => [entry.id, entry.hash]));
}

async function findDifferingIds(kv: Deno.Kv, topic: string, clientMap: Map<string, string>): Promise<string[]> {
  const entries: StoredObject[] = [];
  for await (const item of kv.list<StoredObject>({ prefix: [...KV_OBJECT, topic] })) {
    entries.push(item.value);
  }

  const serverHashes = await Promise.all(entries.map(entry => hashUpdatedAt(entry.updatedAt)));

  return entries
    .filter((entry, idx) => clientMap.get(entry.id) !== serverHashes[idx])
    .map(entry => entry.id);
}

export async function diffObjects(kv: Deno.Kv, topic: string, req: ObjectDiffRequest): Promise<ObjectDiffResult | null> {
  const meta = await kv.get<StoredTopic>([...KV_TOPIC, topic]);
  if (!meta.value) return null;

  const clientMap = buildClientHashMap(req.entries);
  const ids = await findDifferingIds(kv, topic, clientMap);

  return ids.length === 0 ? { kind: "match" } : { kind: "diff", ids };
}

export async function readObjects(kv: Deno.Kv, topic: string): Promise<ObjectEntry[] | null> {
  const meta = await kv.get<StoredTopic>([...KV_TOPIC, topic]);
  if (!meta.value) {
    return null;
  }

  const entries: ObjectEntry[] = [];
  for await (const item of kv.list<StoredObject>({ prefix: [...KV_OBJECT, topic] })) {
    entries.push(item.value);
  }
  return entries;
}

export async function readObject(kv: Deno.Kv, topic: string, id: string): Promise<ObjectEntry | null> {
  const meta = await kv.get<StoredTopic>([...KV_TOPIC, topic]);
  if (!meta.value) {
    return null;
  }

  const entry = await kv.get<StoredObject>([...KV_OBJECT, topic, id]);
  if (!entry.value) {
    return null;
  }

  return entry.value;
}
