// Event diff — bucket-hash reconciliation for event topics
// @work.md

import type { EventDiffRequest, EventDiffResult, EventDiffBucket } from "../../capabilities.ts";
import type { StoredEvent } from "../../types/stored-types.ts";
import { hashEventBucket, hashBucketRoot } from "../hashing.ts";
import { KV_TOPIC, KV_EVENT, KV_BUCKET_HASH, KV_BUCKET_INDEX } from "../../keys.ts";
import { DEFAULT_BUCKET_SIZE } from "../../../../commons/constants.ts";

type BucketEntry = { id: number; updatedAt: number };

function bucketStartFor(id: number, bucketSize: number): number {
  return Math.floor((id - 1) / bucketSize) * bucketSize;
}

function byIdAscending(first: BucketEntry, second: BucketEntry): number {
  return first.id - second.id;
}

// Scans only the events within one bucket's ID range and hashes them.
async function computeBucketHashFromRange(kv: Deno.Kv, topic: string, bucketStart: number, bucketSize: number): Promise<string> {
  const entries: BucketEntry[] = [];
  for await (const item of kv.list<StoredEvent>({
    start: [...KV_EVENT, topic, bucketStart + 1],
    end: [...KV_EVENT, topic, bucketStart + bucketSize + 1],
  })) {
    entries.push({ id: item.value.id, updatedAt: item.value.updatedAt });
  }
  return hashEventBucket(entries.sort(byIdAscending));
}

// Returns the cached hash for a bucket, computing and storing it on a cache miss.
// Cache is only maintained at DEFAULT_BUCKET_SIZE; misses for other sizes are computed but not cached.
async function getCachedOrComputeBucketHash(kv: Deno.Kv, topic: string, bucketStart: number, bucketSize: number): Promise<string> {
  if (bucketSize !== DEFAULT_BUCKET_SIZE) {
    return computeBucketHashFromRange(kv, topic, bucketStart, bucketSize);
  }
  const cacheKey = [...KV_BUCKET_HASH, topic, bucketSize, bucketStart];
  const cached = await kv.get<string>(cacheKey);
  if (cached.value !== null) return cached.value;
  const hash = await computeBucketHashFromRange(kv, topic, bucketStart, bucketSize);
  await kv.set(cacheKey, hash);
  return hash;
}

// Computes server hashes for every client bucket and identifies which differ.
async function computeClientBucketDiffs(
  kv: Deno.Kv,
  topic: string,
  buckets: EventDiffBucket[],
  bucketSize: number,
): Promise<{ serverHashes: string[]; differingRanges: { start: number; end: number }[] }> {
  const serverHashes = await Promise.all(
    buckets.map(bucket => getCachedOrComputeBucketHash(kv, topic, bucket.start, bucketSize)),
  );
  const differingRanges = buckets
    .filter((bucket, idx) => serverHashes[idx] !== bucket.hash)
    .map(bucket => ({ start: bucket.start, end: bucket.end }));
  return { serverHashes, differingRanges };
}

// Returns bucket starts on the server that the client did not include.
// Uses the KV bucket index (maintained only at DEFAULT_BUCKET_SIZE) for an O(n_buckets) scan;
// falls back to a full event scan for non-standard bucket sizes.
async function serverOnlyBucketStarts(
  kv: Deno.Kv,
  topic: string,
  bucketSize: number,
  clientBuckets: EventDiffBucket[],
): Promise<number[]> {
  const clientStarts = new Set(clientBuckets.map(bucket => bucket.start));

  if (bucketSize === DEFAULT_BUCKET_SIZE) {
    const result: number[] = [];
    for await (const item of kv.list<1>({ prefix: [...KV_BUCKET_INDEX, topic, bucketSize] })) {
      const start = item.key[item.key.length - 1] as number;
      if (!clientStarts.has(start)) result.push(start);
    }
    return result;
  }

  // Full scan fallback for non-default bucket sizes (bucket index not maintained for these).
  const serverStarts = new Set<number>();
  for await (const item of kv.list<StoredEvent>({ prefix: [...KV_EVENT, topic] })) {
    serverStarts.add(bucketStartFor(item.value.id, bucketSize));
  }
  return [...serverStarts].filter(start => !clientStarts.has(start));
}

export async function diffEvents(kv: Deno.Kv, topic: string, req: EventDiffRequest): Promise<EventDiffResult | null> {
  const meta = await kv.get([...KV_TOPIC, topic]);
  if (!meta.value) return null;

  const { serverHashes, differingRanges } = await computeClientBucketDiffs(kv, topic, req.buckets, req.bucketSize);
  const serverRoot = await hashBucketRoot(serverHashes);

  const uncoveredStarts = await serverOnlyBucketStarts(kv, topic, req.bucketSize, req.buckets);
  const serverOnlyRanges = uncoveredStarts.map(start => ({ start, end: start + req.bucketSize }));

  if (serverRoot === req.root && serverOnlyRanges.length === 0) return { kind: "match" };

  return { kind: "diff", ranges: [...differingRanges, ...serverOnlyRanges] };
}
