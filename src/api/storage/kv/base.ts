// Low-level Deno KV helpers — thin wrappers over Deno.Kv used by DenoKVBackend
// @work.md

import type { IAtomicWriter } from "../backend.ts";
import { DenoAtomicWriter } from "./atomic.ts";
import type { KvOpsCounter } from "./ops.ts";
import { STREAM_POLL_INTERVAL_MS } from "../../../commons/constants.ts";

// Waits for the poll interval, resolving early if the signal is aborted.
export function waitForPoll(signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, STREAM_POLL_INTERVAL_MS);
    signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

export async function kvGet<T>(kv: Deno.Kv, key: readonly Deno.KvKeyPart[]): Promise<T | null> {
  const entry = await kv.get<T>(key);
  return entry.value;
}

export function kvGetEntry<T>(kv: Deno.Kv, key: readonly Deno.KvKeyPart[]): Promise<Deno.KvEntryMaybe<T>> {
  return kv.get<T>(key);
}

export async function kvSet<T>(kv: Deno.Kv, key: readonly Deno.KvKeyPart[], value: T): Promise<void> {
  await kv.set(key, value);
}

export async function kvSetWithExpiry<T>(kv: Deno.Kv, key: readonly Deno.KvKeyPart[], value: T, expireInMs: number): Promise<void> {
  await kv.set(key, value, { expireIn: expireInMs });
}

export async function kvDelete(kv: Deno.Kv, key: readonly Deno.KvKeyPart[]): Promise<void> {
  await kv.delete(key);
}

export async function* kvList<T>(
  kv: Deno.Kv,
  selector: Deno.KvListSelector,
  options?: { limit?: number },
): AsyncGenerator<Deno.KvEntry<T>> {
  const kvOptions: Deno.KvListOptions = options?.limit !== undefined ? { limit: options.limit } : {};
  yield* kv.list<T>(selector, kvOptions);
}

export function kvAtomic(kv: Deno.Kv, ops?: KvOpsCounter): IAtomicWriter {
  return new DenoAtomicWriter(kv.atomic(), ops);
}
