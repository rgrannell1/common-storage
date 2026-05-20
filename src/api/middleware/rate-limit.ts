// Rate-limiting middleware — per-IP and global sliding window counters backed by Deno KV,
// with a bloom filter to bound KV growth for unseen IPs.
// @work.md

import type { MiddlewareHandler } from "hono";
import { KV_RATE_LIMIT_IP, KV_RATE_LIMIT_GLOBAL, KV_BLOOM_IP } from "../storage/keys.ts";

// Per-IP request limit per 60-second sliding window
const IP_LIMIT = 180;

// Global request limit per 60-second sliding window
const GLOBAL_LIMIT = 10_000;

// Width of each time bucket in milliseconds
const BUCKET_MS = 60_000;

// Bloom filter size in bytes (8192 bits)
const BLOOM_BYTES = 1024;

// Number of hash functions applied per IP
const BLOOM_HASH_COUNT = 3;

// Bloom filter rotation interval in milliseconds
const BLOOM_ROTATION_MS = 3_600_000;

// FNV-1a 32-bit constants
const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

type BloomState = {
  filter: number[];
  createdAt: number;
};

type BucketCounts = {
  current: number;
  previous: number;
};

// FNV-1a hash over a string, seeded by an integer to produce independent hash functions.
function fnv1aSeeded(input: string, seed: number): number {
  let hash = (FNV_OFFSET ^ seed) >>> 0;
  for (let idx = 0; idx < input.length; idx++) {
    hash ^= input.charCodeAt(idx);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash;
}

// Compute the set of bit positions an IP maps to in the bloom filter.
function bloomBitPositions(ip: string, totalBits: number): number[] {
  const positions: number[] = [];
  for (let idx = 0; idx < BLOOM_HASH_COUNT; idx++) {
    positions.push(fnv1aSeeded(ip, idx * 1000) % totalBits);
  }
  return positions;
}

// Return true if all bits for this IP are set in the filter.
function bloomContains(filter: number[], ip: string): boolean {
  const totalBits = filter.length * 8;
  return bloomBitPositions(ip, totalBits).every((bit) => {
    const byteIdx = Math.floor(bit / 8);
    const bitIdx = bit % 8;
    return (filter[byteIdx] & (1 << bitIdx)) !== 0;
  });
}

// Set all bits for this IP in the filter (mutates in place).
function bloomAdd(filter: number[], ip: string): void {
  const totalBits = filter.length * 8;
  for (const bit of bloomBitPositions(ip, totalBits)) {
    const byteIdx = Math.floor(bit / 8);
    const bitIdx = bit % 8;
    filter[byteIdx] |= 1 << bitIdx;
  }
}

// Load the bloom filter from KV; return a fresh one if missing or older than the rotation interval.
async function loadBloom(kv: Deno.Kv): Promise<BloomState> {
  const entry = await kv.get<BloomState>(KV_BLOOM_IP);
  const now = Date.now();

  if (entry.value !== null && now - entry.value.createdAt < BLOOM_ROTATION_MS) {
    return entry.value;
  }

  return { filter: new Array(BLOOM_BYTES).fill(0), createdAt: now };
}

async function saveBloom(kv: Deno.Kv, state: BloomState): Promise<void> {
  await kv.set(KV_BLOOM_IP, state);
}

// Return the current and previous bucket keys for a given KV prefix and timestamp.
function bucketKeys(prefix: string[], nowMs: number): { currentKey: string[]; previousKey: string[] } {
  const currentMinute = Math.floor(nowMs / BUCKET_MS);
  return {
    currentKey: [...prefix, String(currentMinute)],
    previousKey: [...prefix, String(currentMinute - 1)],
  };
}

// Read current and previous bucket counts from KV.
async function readBuckets(kv: Deno.Kv, prefix: string[], nowMs: number): Promise<BucketCounts> {
  const { currentKey, previousKey } = bucketKeys(prefix, nowMs);
  const [currentEntry, previousEntry] = await Promise.all([
    kv.get<number>(currentKey),
    kv.get<number>(previousKey),
  ]);
  return {
    current: currentEntry.value ?? 0,
    previous: previousEntry.value ?? 0,
  };
}

// Increment the current bucket counter in KV. Entries expire after two bucket widths.
async function incrementBucket(kv: Deno.Kv, prefix: string[], nowMs: number): Promise<void> {
  const { currentKey } = bucketKeys(prefix, nowMs);
  const entry = await kv.get<number>(currentKey);
  await kv.set(currentKey, (entry.value ?? 0) + 1, { expireIn: BUCKET_MS * 2 });
}

// Weighted sliding window estimate: current bucket + decayed previous bucket.
function slidingWindowCount(counts: BucketCounts, nowMs: number): number {
  const elapsed = nowMs % BUCKET_MS;
  const previousWeight = (BUCKET_MS - elapsed) / BUCKET_MS;
  return counts.current + counts.previous * previousWeight;
}

// Check and record a global rate limit hit. Returns true if the limit is exceeded.
async function checkGlobalLimit(kv: Deno.Kv, nowMs: number): Promise<boolean> {
  const counts = await readBuckets(kv, KV_RATE_LIMIT_GLOBAL, nowMs);
  if (slidingWindowCount(counts, nowMs) >= GLOBAL_LIMIT) {
    return true;
  }
  await incrementBucket(kv, KV_RATE_LIMIT_GLOBAL, nowMs);
  return false;
}

// Check and record a per-IP rate limit hit. Returns true if the limit is exceeded.
async function checkIpLimit(kv: Deno.Kv, ip: string, nowMs: number): Promise<boolean> {
  const prefix = [...KV_RATE_LIMIT_IP, ip];
  const counts = await readBuckets(kv, prefix, nowMs);
  if (slidingWindowCount(counts, nowMs) >= IP_LIMIT) {
    return true;
  }
  await incrementBucket(kv, prefix, nowMs);
  return false;
}

function tooManyRequests(): Response {
  return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
    status: 429,
    headers: { "Content-Type": "application/json" },
  });
}

// Hono middleware factory. Applies per-IP and global sliding window rate limits.
// Per-IP checks are gated behind a bloom filter — first-time IPs are always allowed
// and added to the filter without creating a KV counter entry.
export function rateLimitMiddleware(kv: Deno.Kv): MiddlewareHandler {
  return async (ctx, next) => {
    const ip = ctx.req.header("CF-Connecting-IP")
      ?? ctx.req.header("X-Forwarded-For")
      ?? "unknown";
    const nowMs = Date.now();

    const globalExceeded = await checkGlobalLimit(kv, nowMs);
    if (globalExceeded) {
      return tooManyRequests();
    }

    const bloom = await loadBloom(kv);
    const knownIp = bloomContains(bloom.filter, ip);

    if (!knownIp) {
      bloomAdd(bloom.filter, ip);
      await saveBloom(kv, bloom);
      await next();
      return;
    }

    const ipExceeded = await checkIpLimit(kv, ip, nowMs);
    if (ipExceeded) {
      return tooManyRequests();
    }

    await next();
  };
}
