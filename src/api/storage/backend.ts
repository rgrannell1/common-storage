// Low-level KV storage interfaces — raw primitives only; domain interfaces live in domain.ts
// @work.md

// Fluent builder for atomic KV operations; commit applies all writes or none
export interface IAtomicWriter {
  set<StoredValue>(key: string[], value: StoredValue): IAtomicWriter;
  delete(key: string[]): IAtomicWriter;
  commit(): Promise<void>;
}

// Raw key-value interface; implementations swap the underlying store without touching domain logic
export interface IStorageBackend {
  init(): Promise<void>;
  close(): Promise<void>;
  get<StoredValue>(key: string[]): Promise<StoredValue | null>;
  set<StoredValue>(key: string[], value: StoredValue): Promise<void>;
  delete(key: string[]): Promise<void>;
  list<StoredValue>(prefix: string[], options?: { start?: string[]; limit?: number }): AsyncIterable<{ key: string[]; value: StoredValue }>;
  atomic(): IAtomicWriter;
}
