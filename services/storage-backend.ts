import { IStorageBackend } from "../types/storage.ts";

export class DenoKVBackend implements IStorageBackend {
  private kv: Deno.Kv | null;

  private fpath: string | undefined;

  constructor(fpath?: string | undefined) {
    this.kv = null;
    this.fpath = fpath;
  }

  async init() {
    this.kv = await Deno.openKv(this.fpath);
  }

  #assertInitialised() {
    if (!this.kv) {
      throw new Error("KV Storage not initialised");
    }
  }

  /*
   * Get a value fom the database
   */
  async getValue<T>(table: string[], id?: string): Promise<T | null> {
    this.#assertInitialised();

    const search = id ? [...table, id] : table;

    return (await this.kv!.get(search)).value as Promise<T | null>;
  }

  /* */
  async deleteValue(table: string[], id: string): Promise<void> {
    this.#assertInitialised();

    await this.kv!.delete([...table, id]);
  }

  /* */
  async *listTable<K, T>(
    table: string[],
    limit?: number,
    /* */
  ): AsyncGenerator<{ key: K; value: T }> {
    this.#assertInitialised();

    const options = limit ? { prefix: table, limit } : { prefix: table };

    for await (const entry of this.kv!.list(options)) {
      yield {
        key: entry.key as K,
        value: entry.value as T,
      };
    }
  }
  /* */
  async setValue<T>(table: string[], id: string, value: T): Promise<void> {
    this.#assertInitialised();

    await this.kv!.set([...table, id], value);
  }
  /* */
  async setValues<T>(rows: [string[], T][]): Promise<void> {
    this.#assertInitialised();

    const atom = this.kv!.atomic();

    for (const [id, value] of rows) {
      atom.set(id, value);
    }

    await atom.commit();
  }
  /* */
  async close() {
    this.#assertInitialised();

    await this.kv!.close();
  }
}
