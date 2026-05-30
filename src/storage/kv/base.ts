// Low-level Deno KV helpers — thin wrappers over Deno.Kv used by DenoKVBackend
// @work.md

import type { IAtomicWriter } from "./backend.ts";
import { DenoAtomicWriter } from "./atomic.ts";
import type { KvOpsCounter } from "./ops.ts";
import { STREAM_POLL_INTERVAL_MS } from "../../commons/constants.ts";

// Waits for the poll interval, resolving early if the signal is aborted.
export function waitForPoll(signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, STREAM_POLL_INTERVAL_MS);
    const handleAbort = () => { clearTimeout(timer); resolve(); };
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

export async function kvGet<Value>(
  kv: Deno.Kv,
  key: readonly Deno.KvKeyPart[],
): Promise<Value | null> {
  const entry = await kv.get<Value>(key);
  return entry.value;
}

export function kvGetEntry<Value>(
  kv: Deno.Kv,
  key: readonly Deno.KvKeyPart[],
): Promise<Deno.KvEntryMaybe<Value>> {
  return kv.get<Value>(key);
}

export async function kvSet<Value>(
  kv: Deno.Kv,
  key: readonly Deno.KvKeyPart[],
  value: Value,
): Promise<void> {
  await kv.set(key, value);
}

export async function kvSetWithExpiry<Value>(
  kv: Deno.Kv,
  key: readonly Deno.KvKeyPart[],
  value: Value,
  expireInMs: number,
): Promise<void> {
  await kv.set(key, value, { expireIn: expireInMs });
}

export async function kvDelete(kv: Deno.Kv, key: readonly Deno.KvKeyPart[]): Promise<void> {
  await kv.delete(key);
}

export async function* kvList<Value>(
  kv: Deno.Kv,
  selector: Deno.KvListSelector,
  options?: { limit?: number },
): AsyncGenerator<Deno.KvEntry<Value>> {
  const hasLimit = options?.limit !== undefined;
  const kvOptions: Deno.KvListOptions = hasLimit ? { limit: options!.limit } : {};
  yield* kv.list<Value>(selector, kvOptions);
}

export function kvAtomic(kv: Deno.Kv, ops?: KvOpsCounter): IAtomicWriter {
  return new DenoAtomicWriter(kv.atomic(), ops);
}
