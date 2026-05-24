// Shared hashing utilities for diff computation — SHA-256 over big-endian uint64 values

import { UINT64_BYTES, SHA256_BYTES } from "../../../commons/constants.ts";

function uint64ToBytes(value: number): Uint8Array {
  const buf = new Uint8Array(8);
  new DataView(buf.buffer).setBigUint64(0, BigInt(value), false);
  return buf;
}

function hexToBytes(hex: string): Uint8Array {
  const buf = new Uint8Array(hex.length / 2);
  for (let idx = 0; idx < buf.length; idx++) {
    buf[idx] = parseInt(hex.slice(idx * 2, idx * 2 + 2), 16);
  }
  return buf;
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(hash)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

// SHA-256 of updatedAt as 8-byte big-endian uint64; used for object entry hashes.
export function hashUpdatedAt(updatedAt: number): Promise<string> {
  return sha256Hex(uint64ToBytes(updatedAt));
}

// Bucket start position for a given entry position and bucket size.
export function bucketStartFor(position: number, bucketSize: number): number {
  return Math.floor((position - 1) / bucketSize) * bucketSize;
}

// SHA-256 over concatenated id||updatedAt pairs (8 bytes each, big-endian) sorted ascending by id; used for bucket hashes over any integer-ordered dimension.
export function hashBucket(entries: Array<{ id: number; updatedAt: number }>): Promise<string> {
  // Layout: each entry occupies 16 bytes — 8 bytes (id) followed by 8 bytes (updatedAt),
  // both big-endian uint64. This matches the spec: SHA-256 of id||updatedAt pairs sorted by id.
  const buf = new Uint8Array(entries.length * UINT64_BYTES * 2);
  const view = new DataView(buf.buffer);
  for (let idx = 0; idx < entries.length; idx++) {
    view.setBigUint64(idx * UINT64_BYTES * 2, BigInt(entries[idx].id), false);
    view.setBigUint64(idx * UINT64_BYTES * 2 + UINT64_BYTES, BigInt(entries[idx].updatedAt), false);
  }
  return sha256Hex(buf);
}

// SHA-256 over concatenated bucket hashes (32 bytes each) in order; used for the event diff root hash.
export function hashBucketRoot(bucketHashes: string[]): Promise<string> {
  const buf = new Uint8Array(bucketHashes.length * SHA256_BYTES);
  for (let idx = 0; idx < bucketHashes.length; idx++) {
    buf.set(hexToBytes(bucketHashes[idx]), idx * SHA256_BYTES);
  }
  return sha256Hex(buf);
}
