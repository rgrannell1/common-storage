// Low-level KV storage interfaces — raw primitives only; domain interfaces live in capabilities.ts
// @work.md

export interface IAtomicWriter {
  check(entry: { key: readonly Deno.KvKeyPart[]; versionstamp: string | null }): IAtomicWriter;
  set<T>(key: readonly Deno.KvKeyPart[], value: T): IAtomicWriter;
  delete(key: readonly Deno.KvKeyPart[]): IAtomicWriter;
  commit(): Promise<{ ok: boolean }>;
}

export interface IStorageBackend {
  init(): Promise<void>;
  close(): Promise<void>;
  get<T>(key: readonly Deno.KvKeyPart[]): Promise<T | null>;
  getEntry<T>(key: readonly Deno.KvKeyPart[]): Promise<Deno.KvEntryMaybe<T>>;
  set<T>(key: readonly Deno.KvKeyPart[], value: T): Promise<void>;
  setWithExpiry<T>(key: readonly Deno.KvKeyPart[], value: T, expireInMs: number): Promise<void>;
  delete(key: readonly Deno.KvKeyPart[]): Promise<void>;
  list<T>(selector: Deno.KvListSelector, options?: { limit?: number }): AsyncIterable<Deno.KvEntry<T>>;
  atomic(): IAtomicWriter;
}
