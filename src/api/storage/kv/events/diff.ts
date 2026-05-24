// Event diff — bucket-hash reconciliation for event topics
// @work.md

import type { IStorageBackend } from "../../backend.ts";
import type { EventDiffRequest, EventDiffResult, EventDiffBucket } from "../../capabilities.ts";
import type { StoredEvent } from "../../types/stored-types.ts";
import { hashBucket, hashBucketRoot } from "../hashing.ts";
import { KV_TOPIC, KV_EVENT, KV_BUCKET_HASH, KV_BUCKET_INDEX, KV_TOPIC_ROOT_HASH } from "../../keys.ts";
import { DEFAULT_EVENT_BUCKET_SIZE } from "../../../../commons/constants.ts";

type BucketEntry = { id: number; updatedAt: number };

function byIdAscending(first: BucketEntry, second: BucketEntry): number {
  return first.id - second.id;
}

// Scans only the events within one bucket's ID range and hashes them.
async function computeBucketHashFromRange(storage: IStorageBackend, topic: string, bucketStart: number): Promise<string> {
  const entries: BucketEntry[] = [];
  for await (const item of storage.list<StoredEvent>({
    start: [...KV_EVENT, topic, bucketStart + 1],
    end: [...KV_EVENT, topic, bucketStart + DEFAULT_EVENT_BUCKET_SIZE + 1],
  })) {
    entries.push({ id: item.value.id, updatedAt: item.value.updatedAt });
  }
  return hashBucket(entries.sort(byIdAscending));
}

// Returns the cached hash for a bucket, computing and storing it on a cache miss.
async function getCachedOrComputeBucketHash(storage: IStorageBackend, topic: string, bucketStart: number): Promise<string> {
  const cacheKey = [...KV_BUCKET_HASH, topic, DEFAULT_EVENT_BUCKET_SIZE, bucketStart];
  const cached = await storage.get<string>(cacheKey);
  if (cached !== null) return cached;
  const hash = await computeBucketHashFromRange(storage, topic, bucketStart);
  await storage.set(cacheKey, hash);
  return hash;
}

// Computes server hashes for every client bucket and identifies which differ.
async function computeClientBucketDiffs(
  storage: IStorageBackend,
  topic: string,
  buckets: EventDiffBucket[],
): Promise<{ differingRanges: { start: number; end: number }[] }> {
  const serverHashes = await Promise.all(
    buckets.map(bucket => getCachedOrComputeBucketHash(storage, topic, bucket.start)),
  );
  const differingRanges = buckets
    .filter((bucket, idx) => serverHashes[idx] !== bucket.hash)
    .map(bucket => ({ start: bucket.start, end: bucket.end }));
  return { differingRanges };
}

// Rolls over all bucket hashes to compute and cache the topic root hash.
async function getOrComputeRootHash(storage: IStorageBackend, topic: string): Promise<string> {
  const cacheKey = [...KV_TOPIC_ROOT_HASH, topic, DEFAULT_EVENT_BUCKET_SIZE];
  const cached = await storage.get<string>(cacheKey);
  if (cached !== null) return cached;

  const bucketStarts: number[] = [];
  for await (const item of storage.list<1>({ prefix: [...KV_BUCKET_INDEX, topic, DEFAULT_EVENT_BUCKET_SIZE] })) {
    bucketStarts.push(item.key[item.key.length - 1] as number);
  }
  bucketStarts.sort((first, second) => first - second);

  const bucketHashes = await Promise.all(bucketStarts.map(start => getCachedOrComputeBucketHash(storage, topic, start)));
  const root = await hashBucketRoot(bucketHashes);
  await storage.set(cacheKey, root);
  return root;
}

// Returns bucket starts on the server that the client did not include.
async function serverOnlyBucketStarts(storage: IStorageBackend, topic: string, clientBuckets: EventDiffBucket[]): Promise<number[]> {
  const clientStarts = new Set(clientBuckets.map(bucket => bucket.start));
  const result: number[] = [];
  for await (const item of storage.list<1>({ prefix: [...KV_BUCKET_INDEX, topic, DEFAULT_EVENT_BUCKET_SIZE] })) {
    const start = item.key[item.key.length - 1] as number;
    if (!clientStarts.has(start)) result.push(start);
  }
  return result;
}

export async function diffEvents(storage: IStorageBackend, topic: string, req: EventDiffRequest): Promise<EventDiffResult | null> {
  const meta = await storage.get([...KV_TOPIC, topic]);
  if (!meta) return null;

  const serverRoot = await getOrComputeRootHash(storage, topic);
  if (serverRoot === req.root) return { kind: "match" };

  const { differingRanges } = await computeClientBucketDiffs(storage, topic, req.buckets);
  const uncoveredStarts = await serverOnlyBucketStarts(storage, topic, req.buckets);
  const serverOnlyRanges = uncoveredStarts.map(start => ({ start, end: start + DEFAULT_EVENT_BUCKET_SIZE }));

  if (differingRanges.length === 0 && serverOnlyRanges.length === 0) return { kind: "match" };
  return { kind: "diff", ranges: [...differingRanges, ...serverOnlyRanges] };
}
