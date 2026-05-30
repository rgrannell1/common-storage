// Payload size guard for KV writes — enforces Deno KV's per-value size limit at
// the storage boundary. @work.md

import { MAX_PAYLOAD_BYTES } from "../../commons/constants.ts";

// Returns true when the JSON-encoded payload would exceed Deno KV's per-value size limit.
// Checked before a write so an oversized payload yields a typed error rather than a KV throw.
export function payloadTooLarge(payload: unknown): boolean {
  return JSON.stringify(payload ?? null).length > MAX_PAYLOAD_BYTES;
}
