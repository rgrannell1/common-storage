// Idempotency key cache — stores and retrieves cached response entries by (topic, key)

import { KV_IDEMPOTENCY } from "../keys.ts";
import { IDEMPOTENCY_TTL_MS } from "../../../commons/constants.ts";

export async function readIdempotencyEntry(kv: Deno.Kv, namespace: string, topic: string, key: string): Promise<unknown | null> {
  const entry = await kv.get<unknown>([...KV_IDEMPOTENCY, namespace, topic, key]);
  return entry.value;
}

export async function writeIdempotencyEntry(kv: Deno.Kv, namespace: string, topic: string, key: string, entry: unknown): Promise<void> {
  await kv.set([...KV_IDEMPOTENCY, namespace, topic, key], entry, { expireIn: IDEMPOTENCY_TTL_MS });
}
