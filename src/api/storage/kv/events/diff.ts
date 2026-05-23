// Event diff — bucket-hash reconciliation for event topics
// @work.md

import type { EventDiffRequest, EventDiffResult, EventDiffBucket } from "../../capabilities.ts";
import type { StoredEvent } from "../../types/stored-types.ts";
import { hashBucket, hashBucketRoot } from "../hashing.ts";
import { KV_TOPIC, KV_EVENT, KV_BUCKET_HASH, KV_BUCKET_INDEX } from "../../keys.ts";
import { DEFAULT_EVENT_BUCKET_SIZE } from "../../../../commons/constants.ts";

type BucketEntry = { id: number; updatedAt: number };

function byIdAscending(first: BucketEntry, second: BucketEntry): number {
  return first.id - second.id;
}

// Scans only the events within one bucket's ID range and hashes them.
async function computeBucketHashFromRange(kv: Deno.Kv, topic: string, bucketStart: number): Promise<string> {
  const entries: BucketEntry[] = [];
  for await (const item of kv.list<StoredEvent>({
    start: [...KV_EVENT, topic, bucketStart + 1],
    end: [...KV_EVENT, topic, bucketStart + DEFAULT_EVENT_BUCKET_SIZE + 1],
  })) {
    entries.push({ id: item.value.id, updatedAt: item.value.updatedAt });
  }
  return hashBucket(entries.sort(byIdAscending));
}

// Returns the cached hash for a bucket, computing and storing it on a cache miss.
async function getCachedOrComputeBucketHash(kv: Deno.Kv, topic: string, bucketStart: number): Promise<string> {
  const cacheKey = [...KV_BUCKET_HASH, topic, DEFAULT_EVENT_BUCKET_SIZE, bucketStart];
  const cached = await kv.get<string>(cacheKey);
  if (cached.value !== null) return cached.value;
  const hash = await computeBucketHashFromRange(kv, topic, bucketStart);
  await kv.set(cacheKey, hash);
  return hash;
}

// Computes server hashes for every client bucket and identifies which differ.
async function computeClientBucketDiffs(
  kv: Deno.Kv,
  topic: string,
  buckets: EventDiffBucket[],
): Promise<{ serverHashes: string[]; differingRanges: { start: number; end: number }[] }> {
  const serverHashes = await Promise.all(
    buckets.map(bucket => getCachedOrComputeBucketHash(kv, topic, bucket.start)),
  );
  const differingRanges = buckets
    .filter((bucket, idx) => serverHashes[idx] !== bucket.hash)
    .map(bucket => ({ start: bucket.start, end: bucket.end }));
  return { serverHashes, differingRanges };
}

// Returns bucket starts on the server that the client did not include.
async function serverOnlyBucketStarts(kv: Deno.Kv, topic: string, clientBuckets: EventDiffBucket[]): Promise<number[]> {
  const clientStarts = new Set(clientBuckets.map(bucket => bucket.start));
  const result: number[] = [];
  for await (const item of kv.list<1>({ prefix: [...KV_BUCKET_INDEX, topic, DEFAULT_EVENT_BUCKET_SIZE] })) {
    const start = item.key[item.key.length - 1] as number;
    if (!clientStarts.has(start)) result.push(start);
  }
  return result;
}

export async function diffEvents(kv: Deno.Kv, topic: string, req: EventDiffRequest): Promise<EventDiffResult | null> {
  const meta = await kv.get([...KV_TOPIC, topic]);
  if (!meta.value) return null;

  const { serverHashes, differingRanges } = await computeClientBucketDiffs(kv, topic, req.buckets);
  const serverRoot = await hashBucketRoot(serverHashes);

  const uncoveredStarts = await serverOnlyBucketStarts(kv, topic, req.buckets);
  const serverOnlyRanges = uncoveredStarts.map(start => ({ start, end: start + DEFAULT_EVENT_BUCKET_SIZE }));

  if (serverRoot === req.root && serverOnlyRanges.length === 0) return { kind: "match" };

  return { kind: "diff", ranges: [...differingRanges, ...serverOnlyRanges] };
}
