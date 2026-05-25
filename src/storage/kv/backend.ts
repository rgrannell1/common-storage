// Low-level KV storage interfaces — raw primitives only; domain interfaces live in capabilities.ts
// @work.md

export interface IAtomicWriter {
  check(entry: { key: readonly Deno.KvKeyPart[]; versionstamp: string | null }): IAtomicWriter;
  set<Value>(key: readonly Deno.KvKeyPart[], value: Value): IAtomicWriter;
  delete(key: readonly Deno.KvKeyPart[]): IAtomicWriter;
  commit(): Promise<{ ok: boolean }>;
}

export interface IStorageBackend {
  init(): Promise<void>;
  close(): Promise<void>;
  get<Value>(key: readonly Deno.KvKeyPart[]): Promise<Value | null>;
  getEntry<Value>(key: readonly Deno.KvKeyPart[]): Promise<Deno.KvEntryMaybe<Value>>;
  set<Value>(key: readonly Deno.KvKeyPart[], value: Value): Promise<void>;
  setWithExpiry<Value>(key: readonly Deno.KvKeyPart[], value: Value, expireInMs: number): Promise<void>;
  delete(key: readonly Deno.KvKeyPart[]): Promise<void>;
  list<Value>(selector: Deno.KvListSelector, options?: { limit?: number }): AsyncIterable<Deno.KvEntry<Value>>;
  atomic(): IAtomicWriter;
}
