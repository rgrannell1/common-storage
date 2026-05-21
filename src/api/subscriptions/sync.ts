// One subscription sync cycle: diff → fetch ranges → tail → write locally.
// Decoupled from the HTTP server; depends only on narrow storage interfaces.

import type { SubscriptionConfig } from "../../commons/config.ts";
import type { IReadEvents, IUpdateEvent, EventEntry } from "../storage/capabilities.ts";
import { buildDiffRequest } from "./diff.ts";
import { postDiff, fetchRange, tailEvents } from "./client.ts";

type SyncStorage = IReadEvents & IUpdateEvent;

async function replicateEntry(storage: SyncStorage, topic: string, entry: EventEntry): Promise<void> {
  await storage.updateEvent(topic, entry.id, entry.payload, {
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  });
}

async function fetchAndReplicate(
  storage: SyncStorage,
  topic: string,
  baseUrl: string,
  token: string,
  start: number,
  size: number,
): Promise<number> {
  const entries = await fetchRange(baseUrl, topic, token, start, size);
  for (const entry of entries) {
    await replicateEntry(storage, topic, entry);
  }
  return entries.length > 0 ? entries[entries.length - 1].id : start - 1;
}

async function fullFetch(storage: SyncStorage, topic: string, baseUrl: string, token: string, bucketSize: number): Promise<void> {
  let start = 1;
  while (true) {
    const entries = await fetchRange(baseUrl, topic, token, start, bucketSize);
    for (const entry of entries) {
      await replicateEntry(storage, topic, entry);
    }
    if (entries.length < bucketSize) break;
    start = entries[entries.length - 1].id + 1;
  }
}

export async function syncOnce(config: SubscriptionConfig, storage: SyncStorage): Promise<void> {
  const token = Deno.env.get(config.token) ?? "";
  const local = await storage.readEvents(config.topic, {});
  if (local === null) return;

  if (local.length === 0) {
    await fullFetch(storage, config.topic, config.source, token, 500);
    return;
  }

  const diffReq = await buildDiffRequest(local);
  const diffResult = await postDiff(config.source, config.topic, token, diffReq);
  if (diffResult.kind === "match") return;

  let maxId = local.length > 0 ? local[local.length - 1].id : 0;
  for (const range of diffResult.ranges) {
    const lastId = await fetchAndReplicate(storage, config.topic, config.source, token, range.start + 1, diffReq.bucketSize);
    maxId = Math.max(maxId, lastId);
  }

  const tailed = await tailEvents(config.source, config.topic, token, maxId + 1);
  for (const entry of tailed) {
    await replicateEntry(storage, config.topic, entry);
  }
}
