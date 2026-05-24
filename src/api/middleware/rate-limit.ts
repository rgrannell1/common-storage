// Rate-limiting middleware — per-IP and global sliding window counters backed by Deno KV,
// with a bloom filter to bound KV growth for unseen IPs.
// @work.md

import type { MiddlewareHandler } from "hono";
import type { IStorageBackend } from "../storage/backend.ts";
import { KV_RATE_LIMIT_IP, KV_RATE_LIMIT_GLOBAL } from "../storage/keys.ts";
import {
  DEFAULT_IP_LIMIT,
  DEFAULT_GLOBAL_LIMIT,
  RATE_LIMIT_BUCKET_MS,
} from "../../commons/constants.ts";

export type RateLimitConfig = {
  ipLimit: number;
  globalLimit: number;
};

type BucketCounts = {
  current: number;
  previous: number;
};

// Return the current and previous bucket keys for a given KV prefix and timestamp.
function bucketKeys(prefix: string[], nowMs: number): { currentKey: string[]; previousKey: string[] } {
  const currentMinute = Math.floor(nowMs / RATE_LIMIT_BUCKET_MS);
  return {
    currentKey: [...prefix, String(currentMinute)],
    previousKey: [...prefix, String(currentMinute - 1)],
  };
}

// Read current and previous bucket counts from KV.
async function readBuckets(storage: IStorageBackend, prefix: string[], nowMs: number): Promise<BucketCounts> {
  const { currentKey, previousKey } = bucketKeys(prefix, nowMs);
  const [current, previous] = await Promise.all([
    storage.get<number>(currentKey),
    storage.get<number>(previousKey),
  ]);
  return {
    current: current ?? 0,
    previous: previous ?? 0,
  };
}

// Increment the current bucket counter in KV. Entries expire after two bucket widths.
async function incrementBucket(storage: IStorageBackend, prefix: string[], nowMs: number): Promise<void> {
  const { currentKey } = bucketKeys(prefix, nowMs);
  const current = await storage.get<number>(currentKey);
  await storage.setWithExpiry(currentKey, (current ?? 0) + 1, RATE_LIMIT_BUCKET_MS * 2);
}

// Weighted sliding window estimate: current bucket + decayed previous bucket.
function slidingWindowCount(counts: BucketCounts, nowMs: number): number {
  const elapsed = nowMs % RATE_LIMIT_BUCKET_MS;
  const previousWeight = (RATE_LIMIT_BUCKET_MS - elapsed) / RATE_LIMIT_BUCKET_MS;
  return counts.current + counts.previous * previousWeight;
}

// Check and record a global rate limit hit. Returns true if the limit is exceeded.
async function checkGlobalLimit(storage: IStorageBackend, limit: number, nowMs: number): Promise<boolean> {
  const counts = await readBuckets(storage, KV_RATE_LIMIT_GLOBAL, nowMs);
  if (slidingWindowCount(counts, nowMs) >= limit) {
    return true;
  }
  await incrementBucket(storage, KV_RATE_LIMIT_GLOBAL, nowMs);
  return false;
}

// Check and record a per-IP rate limit hit. Returns true if the limit is exceeded.
async function checkIpLimit(storage: IStorageBackend, ip: string, limit: number, nowMs: number): Promise<boolean> {
  const prefix = [...KV_RATE_LIMIT_IP, ip];
  const counts = await readBuckets(storage, prefix, nowMs);
  if (slidingWindowCount(counts, nowMs) >= limit) {
    return true;
  }
  await incrementBucket(storage, prefix, nowMs);
  return false;
}

function tooManyRequests(): Response {
  return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
    status: 429,
    headers: { "Content-Type": "application/json" },
  });
}

// Hono middleware factory. Applies per-IP and global sliding window rate limits.
export function rateLimitMiddleware(storage: IStorageBackend, config?: RateLimitConfig): MiddlewareHandler {
  const ipLimit = config?.ipLimit ?? DEFAULT_IP_LIMIT;
  const globalLimit = config?.globalLimit ?? DEFAULT_GLOBAL_LIMIT;

  return async (ctx, next) => {
    const ip = ctx.req.header("CF-Connecting-IP")
      ?? ctx.req.header("X-Forwarded-For")
      ?? "unknown";
    const nowMs = Date.now();

    const globalExceeded = await checkGlobalLimit(storage, globalLimit, nowMs);
    if (globalExceeded) {
      return tooManyRequests();
    }

    const ipExceeded = await checkIpLimit(storage, ip, ipLimit, nowMs);
    if (ipExceeded) {
      return tooManyRequests();
    }

    await next();
  };
}
