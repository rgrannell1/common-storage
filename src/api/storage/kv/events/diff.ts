// Event diff — bucket-hash reconciliation for event topics
// @work.md

import type { EventDiffRequest, EventDiffResult, EventDiffBucket } from "../../capabilities.ts";
import type { StoredTopic, StoredEvent } from "../../types/stored-types.ts";
import { hashEventBucket, hashBucketRoot } from "../hashing.ts";
import { KV_TOPIC, KV_EVENT } from "../../keys.ts";

type BucketEntry = { id: number; updatedAt: number };

function bucketStartFor(id: number, bucketSize: number): number {
  return Math.floor((id - 1) / bucketSize) * bucketSize;
}

function byIdAscending(first: BucketEntry, second: BucketEntry): number {
  return first.id - second.id;
}

// Scans all events in the topic and groups them by bucket start offset.
async function buildBucketMap(kv: Deno.Kv, topic: string, bucketSize: number): Promise<Map<number, BucketEntry[]>> {
  const bucketMap = new Map<number, BucketEntry[]>();
  for await (const item of kv.list<StoredEvent>({ prefix: [...KV_EVENT, topic] })) {
    const { id, updatedAt } = item.value;
    const bucketStart = bucketStartFor(id, bucketSize);
    if (!bucketMap.has(bucketStart)) bucketMap.set(bucketStart, []);
    bucketMap.get(bucketStart)!.push({ id, updatedAt });
  }
  return bucketMap;
}

// Computes a SHA-256 hash for each client bucket against the server's entries.
function computeBucketHashes(bucketMap: Map<number, BucketEntry[]>, buckets: EventDiffBucket[]): Promise<string[]> {
  return Promise.all(buckets.map(bucket => {
    const entries = (bucketMap.get(bucket.start) ?? []).sort(byIdAscending);
    return hashEventBucket(entries);
  }));
}

// Returns the subset of buckets whose server hash differs from the client hash.
function differingRanges(buckets: EventDiffBucket[], serverHashes: string[]): { start: number; end: number }[] {
  return buckets
    .filter((bucket, idx) => serverHashes[idx] !== bucket.hash)
    .map(bucket => ({ start: bucket.start, end: bucket.end }));
}

// Returns server buckets the client did not mention — i.e. ID ranges the client has never seen.
function uncoveredServerRanges(
  bucketMap: Map<number, BucketEntry[]>,
  clientBuckets: EventDiffBucket[],
  bucketSize: number,
): { start: number; end: number }[] {
  const clientStarts = new Set(clientBuckets.map(bucket => bucket.start));
  const result: { start: number; end: number }[] = [];
  for (const start of bucketMap.keys()) {
    if (!clientStarts.has(start)) result.push({ start, end: start + bucketSize });
  }
  return result;
}

export async function diffEvents(kv: Deno.Kv, topic: string, req: EventDiffRequest): Promise<EventDiffResult | null> {
  const meta = await kv.get<StoredTopic>([...KV_TOPIC, topic]);
  if (!meta.value) return null;

  const bucketMap = await buildBucketMap(kv, topic, req.bucketSize);
  const serverHashes = await computeBucketHashes(bucketMap, req.buckets);
  const serverRoot = await hashBucketRoot(serverHashes);
  const serverOnly = uncoveredServerRanges(bucketMap, req.buckets, req.bucketSize);

  if (serverRoot === req.root && serverOnly.length === 0) return { kind: "match" };

  return { kind: "diff", ranges: [...differingRanges(req.buckets, serverHashes), ...serverOnly] };
}
