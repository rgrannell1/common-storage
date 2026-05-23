// One subscription sync cycle: diff → fetch ranges → tail → write locally.
// Decoupled from the HTTP server; depends only on narrow storage interfaces.

import type { SubscriptionConfig } from "../../commons/config.ts";
import type { IReadEvents, IUpdateEvent, EventEntry } from "../storage/capabilities.ts";
import type { ILogger } from "../../commons/logger.ts";
import { buildDiffRequest } from "./diff.ts";
import { postDiff, fetchRange, tailEvents } from "./client.ts";
import { DEFAULT_BUCKET_SIZE } from "../../commons/constants.ts";

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
  logger: ILogger,
): Promise<number> {
  logger.info("subscription fetch", undefined, { topic, start, source: baseUrl });
  const entries = await fetchRange(baseUrl, topic, token, start, size);
  for (const entry of entries) {
    await replicateEntry(storage, topic, entry);
  }
  return entries.length > 0 ? entries[entries.length - 1].id : start - 1;
}

async function fullFetch(storage: SyncStorage, topic: string, baseUrl: string, token: string, bucketSize: number, logger: ILogger): Promise<void> {
  let start = 1;
  while (true) {
    logger.info("subscription fetch", undefined, { topic, start, source: baseUrl });
    const entries = await fetchRange(baseUrl, topic, token, start, bucketSize);
    for (const entry of entries) {
      await replicateEntry(storage, topic, entry);
    }
    if (entries.length < bucketSize) break;
    start = entries[entries.length - 1].id + 1;
  }
}

export async function syncOnce(config: SubscriptionConfig, storage: SyncStorage, logger: ILogger): Promise<void> {
  const token = Deno.env.get(config.token) ?? "";
  logger.info("subscription sync start", undefined, { source: config.source, topic: config.topic, frequency: config.frequency });

  const local = await storage.readEvents(config.topic, {});
  if (local === null) return;

  if (local.length === 0) {
    await fullFetch(storage, config.topic, config.source, token, DEFAULT_BUCKET_SIZE, logger);
    logger.info("subscription sync complete", undefined, { source: config.source, topic: config.topic });
    return;
  }

  const diffReq = await buildDiffRequest(local);
  const diffResult = await postDiff(config.source, config.topic, token, diffReq);
  if (diffResult.kind === "match") {
    logger.info("subscription sync complete", undefined, { source: config.source, topic: config.topic });
    return;
  }

  const initialMaxId = local.length > 0 ? local[local.length - 1].id : 0;
  await applyDiffAndTail(storage, config, token, diffResult.ranges, diffReq.bucketSize, initialMaxId, logger);
  logger.info("subscription sync complete", undefined, { source: config.source, topic: config.topic });
}

// Fetches differing ranges then tails the stream to catch writes that arrived during the diff round-trip.
async function applyDiffAndTail(
  storage: SyncStorage,
  config: SubscriptionConfig,
  token: string,
  ranges: { start: number; end: number }[],
  bucketSize: number,
  initialMaxId: number,
  logger: ILogger,
): Promise<void> {
  let maxId = initialMaxId;
  for (const range of ranges) {
    const lastId = await fetchAndReplicate(storage, config.topic, config.source, token, range.start + 1, bucketSize, logger);
    maxId = Math.max(maxId, lastId);
  }

  const tailed = await tailEvents(config.source, config.topic, token, maxId + 1);
  for (const entry of tailed) {
    await replicateEntry(storage, config.topic, entry);
  }
}
