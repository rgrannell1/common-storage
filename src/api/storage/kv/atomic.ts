// DenoAtomicWriter — wraps Deno.AtomicOperation behind IAtomicWriter

import type { IAtomicWriter } from "../backend.ts";

export class DenoAtomicWriter implements IAtomicWriter {
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
