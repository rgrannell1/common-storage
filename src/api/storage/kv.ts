// Deno KV implementation of IStorageBackend
// @design.md

import type { IAtomicWriter, IStorageBackend } from "./backend.ts";

class DenoAtomicWriter implements IAtomicWriter {
  private op: Deno.AtomicOperation;

  constructor(op: Deno.AtomicOperation) {
    this.op = op;
  }

  set<StoredValue>(key: string[], value: StoredValue): IAtomicWriter {
    this.op = this.op.set(key, value);
    return this;
  }

  delete(key: string[]): IAtomicWriter {
    this.op = this.op.delete(key);
    return this;
  }

  async commit(): Promise<void> {
    await this.op.commit();
  }
}

export class DenoKVBackend implements IStorageBackend {
  private kv: Deno.Kv | null = null;
  private path: string | undefined;

  constructor(path?: string) {
    this.path = path;
  }

  async init(): Promise<void> {
    this.kv = await Deno.openKv(this.path);
  }

  async close(): Promise<void> {
    this.#assertInitialised();
    this.kv!.close();
  }

  async get<StoredValue>(key: string[]): Promise<StoredValue | null> {
    this.#assertInitialised();
    const entry = await this.kv!.get<StoredValue>(key);
    return entry.value;
  }

  async set<StoredValue>(key: string[], value: StoredValue): Promise<void> {
    this.#assertInitialised();
    await this.kv!.set(key, value);
  }

  async delete(key: string[]): Promise<void> {
    this.#assertInitialised();
    await this.kv!.delete(key);
  }

  async *list<StoredValue>(
    prefix: string[],
    options?: { start?: string[]; limit?: number },
  ): AsyncGenerator<{ key: string[]; value: StoredValue }> {
    this.#assertInitialised();

    const selector: Deno.KvListSelector = options?.start
      ? { prefix, start: options.start }
      : { prefix };

    const kvOptions: Deno.KvListOptions = options?.limit
      ? { limit: options.limit }
      : {};

    for await (const entry of this.kv!.list<StoredValue>(selector, kvOptions)) {
      yield { key: entry.key as string[], value: entry.value };
    }
  }

  atomic(): IAtomicWriter {
    this.#assertInitialised();
    return new DenoAtomicWriter(this.kv!.atomic());
  }

  #assertInitialised(): void {
    if (!this.kv) {
      throw new Error("DenoKVBackend has not been initialised; call init() first");
    }
  }
}
