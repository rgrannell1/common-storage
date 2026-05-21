// Builds the local diff request body from a set of local event entries.
// Pure — no I/O; hashing is async due to Web Crypto.

import type { EventEntry, EventDiffRequest } from "../storage/capabilities.ts";
import { hashEventBucket, hashBucketRoot } from "../storage/kv/hashing.ts";
import { DEFAULT_BUCKET_SIZE } from "../../commons/constants.ts";

type BucketEntry = { id: number; updatedAt: number };

function groupIntoBuckets(entries: BucketEntry[], bucketSize: number): Map<number, BucketEntry[]> {
  const map = new Map<number, BucketEntry[]>();
  for (const entry of entries) {
    const start = Math.floor((entry.id - 1) / bucketSize) * bucketSize;
    if (!map.has(start)) map.set(start, []);
    map.get(start)!.push(entry);
  }
  return map;
}

export async function buildDiffRequest(entries: EventEntry[], bucketSize: number = DEFAULT_BUCKET_SIZE): Promise<EventDiffRequest> {
  const bucketMap = groupIntoBuckets(entries, bucketSize);
  const bucketStarts = [...bucketMap.keys()].sort((first, second) => first - second);

  const buckets = await Promise.all(bucketStarts.map(async (start) => {
    const sorted = (bucketMap.get(start) ?? []).sort((first, second) => first.id - second.id);
    const hash = await hashEventBucket(sorted);
    return { start, end: start + bucketSize, hash };
  }));

  const root = await hashBucketRoot(buckets.map(bucket => bucket.hash));
  return { bucketSize, root, buckets };
}
