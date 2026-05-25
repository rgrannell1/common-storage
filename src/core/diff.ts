// Builds diff request bodies from local entries. Pure — no I/O.

import type { EventEntry, ObjectEntry, EventDiffRequest, ObjectDiffRequest } from "../storage/capabilities.ts";
import { hashBucket, hashBucketRoot } from "./hashing.ts";
import { DEFAULT_EVENT_BUCKET_SIZE, DEFAULT_OBJECT_BUCKET_SIZE } from "../commons/constants.ts";

type BucketEntry = { id: number; updatedAt: number };

function groupByBucket(entries: BucketEntry[], bucketSize: number): Map<number, BucketEntry[]> {
  const map = new Map<number, BucketEntry[]>();
  for (const entry of entries) {
    const start = Math.floor((entry.id - 1) / bucketSize) * bucketSize;
    if (!map.has(start)) map.set(start, []);
    map.get(start)!.push(entry);
  }
  return map;
}

async function buildDiffRequest(entries: BucketEntry[], bucketSize: number): Promise<EventDiffRequest> {
  const bucketMap = groupByBucket(entries, bucketSize);
  const bucketStarts = [...bucketMap.keys()].sort((first, second) => first - second);
  const buckets = await Promise.all(bucketStarts.map(async (start) => {
    const sorted = (bucketMap.get(start) ?? []).sort((first, second) => first.id - second.id);
    const hash = await hashBucket(sorted);
    return { start, end: start + bucketSize, hash };
  }));
  const root = await hashBucketRoot(buckets.map(bucket => bucket.hash));
  return { root, buckets };
}

export function buildEventDiffRequest(entries: EventEntry[]): Promise<EventDiffRequest> {
  return buildDiffRequest(
    entries.map(entry => ({ id: entry.id, updatedAt: entry.updatedAt })),
    DEFAULT_EVENT_BUCKET_SIZE,
  );
}

export function buildObjectDiffRequest(entries: ObjectEntry[]): Promise<ObjectDiffRequest> {
  return buildDiffRequest(
    entries.map(entry => ({ id: entry.seq, updatedAt: entry.updatedAt })),
    DEFAULT_OBJECT_BUCKET_SIZE,
  );
}
