// DenoAtomicWriter — wraps Deno.AtomicOperation behind IAtomicWriter

import type { IAtomicWriter } from "../backend.ts";
import type { KvOpsCounter } from "./ops.ts";

export class DenoAtomicWriter implements IAtomicWriter {
  private op: Deno.AtomicOperation;
  private ops: KvOpsCounter | null;

  constructor(op: Deno.AtomicOperation, ops?: KvOpsCounter) {
    this.op = op;
    this.ops = ops ?? null;
  }

  check(entry: { key: readonly Deno.KvKeyPart[]; versionstamp: string | null }): IAtomicWriter {
    this.op = this.op.check(entry);
    return this;
  }

  set<T>(key: readonly Deno.KvKeyPart[], value: T): IAtomicWriter {
    if (this.ops) this.ops.writes++;
    this.op = this.op.set(key, value);
    return this;
  }

  delete(key: readonly Deno.KvKeyPart[]): IAtomicWriter {
    if (this.ops) this.ops.writes++;
    this.op = this.op.delete(key);
    return this;
  }

  async commit(): Promise<{ ok: boolean }> {
    return this.op.commit();
  }
}
