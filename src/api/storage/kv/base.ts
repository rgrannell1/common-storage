// Low-level Deno KV helpers — thin wrappers over Deno.Kv used by DenoKVBackend
// @work.md

import type { IAtomicWriter } from "../backend.ts";
import { DenoAtomicWriter } from "./atomic.ts";

export async function kvGet<StoredValue>(kv: Deno.Kv, key: string[]): Promise<StoredValue | null> {
  const entry = await kv.get<StoredValue>(key);
  return entry.value;
}

export async function kvSet<StoredValue>(kv: Deno.Kv, key: string[], value: StoredValue): Promise<void> {
  await kv.set(key, value);
}

export async function kvSetWithExpiry<StoredValue>(kv: Deno.Kv, key: string[], value: StoredValue, expireInMs: number): Promise<void> {
  await kv.set(key, value, { expireIn: expireInMs });
}

export async function kvDelete(kv: Deno.Kv, key: string[]): Promise<void> {
  await kv.delete(key);
}

export async function* kvList<StoredValue>(
  kv: Deno.Kv,
  prefix: string[],
  options?: { start?: string[]; limit?: number },
): AsyncGenerator<{ key: string[]; value: StoredValue }> {
  const selector: Deno.KvListSelector = options?.start
    ? { prefix, start: options.start }
    : { prefix };

  const kvOptions: Deno.KvListOptions = options?.limit
    ? { limit: options.limit }
    : {};

  for await (const entry of kv.list<StoredValue>(selector, kvOptions)) {
    yield { key: entry.key as string[], value: entry.value };
  }
}

export function kvAtomic(kv: Deno.Kv): IAtomicWriter {
  return new DenoAtomicWriter(kv.atomic());
}
