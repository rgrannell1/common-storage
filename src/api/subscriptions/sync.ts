// One subscription sync cycle: Merkle diff → fetch ranges → tail → write locally.
// Decoupled from the HTTP server; depends only on narrow storage interfaces.

import type { SubscriptionConfig } from "../../commons/config.ts";
import type { IReadEvents, IUpdateEvent, EventEntry } from "../../storage/capabilities.ts";
import type { ILogger } from "../../commons/logger.ts";
import { buildDiffTree } from "./diff.ts";
import { postDiffRound, fetchRange, tailEvents } from "./client.ts";
import {
  DEFAULT_FETCH_PAGE_SIZE,
  MERKLE_TREE_END,
  MERKLE_LEAF_SIZE,
} from "../../commons/constants.ts";
import type { ClientMerkleTree } from "../../core/diff.ts";

type SyncStorage = IReadEvents & IUpdateEvent;

async function replicateEntry(
  storage: SyncStorage,
  topic: string,
  entry: EventEntry,
): Promise<void> {
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

async function fullFetch(
  storage: SyncStorage,
  topic: string,
  baseUrl: string,
  token: string,
  logger: ILogger,
): Promise<void> {
  let start = 1;
  while (true) {
    logger.info("subscription fetch", undefined, { topic, start, source: baseUrl });
    const entries = await fetchRange(baseUrl, topic, token, start, DEFAULT_FETCH_PAGE_SIZE);
    for (const entry of entries) {
      await replicateEntry(storage, topic, entry);
    }
    if (entries.length < DEFAULT_FETCH_PAGE_SIZE) break;
    start = entries[entries.length - 1].id + 1;
  }
}

// Runs the interactive Merkle diff loop and returns leaf ranges that need fetching.
async function merkleDiff(
  baseUrl: string,
  topic: string,
  token: string,
  tree: ClientMerkleTree,
): Promise<{ start: number; end: number }[]> {
  const rootHash = await tree.hashForRange(0, MERKLE_TREE_END);
  let frontier = [{ start: 0, end: MERKLE_TREE_END, hash: rootHash }];
  const leafRanges: { start: number; end: number }[] = [];

  while (frontier.length > 0) {
    const response = await postDiffRound(baseUrl, topic, token, frontier);
    if (response.kind === "match") break;

    const nextFrontier: typeof frontier = [];
    for (const mismatch of response.mismatches) {
      if (mismatch.isLeaf) {
        leafRanges.push({ start: mismatch.start, end: mismatch.end });
      } else {
        const mid = Math.floor((mismatch.start + mismatch.end) / 2);
        const [leftHash, rightHash] = await Promise.all([
          tree.hashForRange(mismatch.start, mid),
          tree.hashForRange(mid, mismatch.end),
        ]);
        nextFrontier.push({ start: mismatch.start, end: mid, hash: leftHash });
        nextFrontier.push({ start: mid, end: mismatch.end, hash: rightHash });
      }
    }
    frontier = nextFrontier;
  }

  return leafRanges;
}

export async function syncOnce(
  config: SubscriptionConfig,
  storage: SyncStorage,
  logger: ILogger,
): Promise<void> {
  const token = Deno.env.get(config.token);
  if (token === undefined) {
    const message = `subscription token env var '${config.token}' is not set`;
    logger.error(`${message} — skipping sync`, undefined, {
      topic: config.topic,
      source: config.source,
    });
    return;
  }
  const logContext = { source: config.source, topic: config.topic };
  logger.info("subscription sync start", undefined, {
    ...logContext,
    frequency: config.frequency,
  });

  const local = await storage.readEvents(config.topic, {});
  if (local === null) return;

  if (local.length === 0) {
    await fullFetch(storage, config.topic, config.source, token, logger);
    logger.info("subscription sync complete", undefined, logContext);
    return;
  }

  const tree = buildDiffTree(local);
  const leafRanges = await merkleDiff(config.source, config.topic, token, tree);

  if (leafRanges.length === 0) {
    logger.info("subscription sync complete", undefined, logContext);
    return;
  }

  const initialMaxId = local.length > 0 ? local[local.length - 1].id : 0;
  await applyDiffAndTail(
    storage,
    config,
    token,
    leafRanges,
    initialMaxId,
    logger,
  );
  logger.info("subscription sync complete", undefined, logContext);
}

// Fetches differing leaf ranges then tails the stream to catch writes during diff rounds.
async function applyDiffAndTail(
  storage: SyncStorage,
  config: SubscriptionConfig,
  token: string,
  leafRanges: { start: number; end: number }[],
  initialMaxId: number,
  logger: ILogger,
): Promise<void> {
  let maxId = initialMaxId;
  for (const range of leafRanges) {
    // range.start is the exclusive lower bound; fetch from start+1
    const lastId = await fetchAndReplicate(
      storage,
      config.topic,
      config.source,
      token,
      range.start + 1,
      MERKLE_LEAF_SIZE,
      logger,
    );
    maxId = Math.max(maxId, lastId);
  }

  const tailed = await tailEvents(config.source, config.topic, token, maxId + 1);
  for (const entry of tailed) {
    await replicateEntry(storage, config.topic, entry);
  }
}
