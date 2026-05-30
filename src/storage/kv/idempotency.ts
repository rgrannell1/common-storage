// Idempotency key cache — stores and retrieves cached response entries by (topic, key)

import type { IStorageBackend } from "./backend.ts";
import { KV_IDEMPOTENCY } from "./keys.ts";
import { IDEMPOTENCY_TTL_MS } from "../../commons/constants.ts";

export function readIdempotencyEntry(
  storage: IStorageBackend,
  namespace: string,
  topic: string,
  key: string,
): Promise<unknown | null> {
  return storage.get<unknown>([...KV_IDEMPOTENCY, namespace, topic, key]);
}

export async function writeIdempotencyEntry(
  storage: IStorageBackend,
  namespace: string,
  topic: string,
  key: string,
  entry: unknown,
): Promise<void> {
  const kvKey = [...KV_IDEMPOTENCY, namespace, topic, key];
  await storage.setWithExpiry(kvKey, entry, IDEMPOTENCY_TTL_MS);
}
