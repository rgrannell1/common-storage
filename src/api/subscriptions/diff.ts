// Builds the local diff request body from a set of local event entries.
// Pure — no I/O; hashing is async due to Web Crypto.

import type { EventEntry, EventDiffRequest } from "../../storage/capabilities.ts";
import { hashBucket, hashBucketRoot } from "../../core/hashing.ts";
import { DEFAULT_EVENT_BUCKET_SIZE } from "../../commons/constants.ts";

type BucketEntry = { id: number; updatedAt: number };

function groupIntoBuckets(entries: BucketEntry[]): Map<number, BucketEntry[]> {
  const map = new Map<number, BucketEntry[]>();
  for (const entry of entries) {
    const start = Math.floor((entry.id - 1) / DEFAULT_EVENT_BUCKET_SIZE) * DEFAULT_EVENT_BUCKET_SIZE;
    if (!map.has(start)) map.set(start, []);
    map.get(start)!.push(entry);
  }
  return map;
}

export async function buildDiffRequest(entries: EventEntry[]): Promise<EventDiffRequest> {
  const bucketMap = groupIntoBuckets(entries);
  const bucketStarts = [...bucketMap.keys()].sort((first, second) => first - second);

  const buckets = await Promise.all(bucketStarts.map(async (start) => {
    const sorted = (bucketMap.get(start) ?? []).sort((first, second) => first.id - second.id);
    const hash = await hashBucket(sorted);
    return { start, end: start + DEFAULT_EVENT_BUCKET_SIZE, hash };
  }));

  const root = await hashBucketRoot(buckets.map(bucket => bucket.hash));
  return { root, buckets };
}
