import { IStorageBackend } from "../../types/storage.ts";

export class DenoKVBackend implements IStorageBackend {
  /*
   * A backend based on Deno KV
   */
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
   * Get a value from the database
   *
   * @param table - The table to get the value from
   * @param id - The id of the value to get
   */
  async getValue<T>(table: string[], id?: string): Promise<T | null> {
    this.#assertInitialised();

    const search = id ? [...table, id] : table;

    return (await this.kv!.get(search)).value as Promise<T | null>;
  }

  /*
   * Delete a value from the database
   *
   * @param table - The table to delete the value from
   * @param id - The id of the value to delete
   */
  async deleteValue(table: string[], id: string): Promise<void> {
    this.#assertInitialised();

    await this.kv!.delete([...table, id]);
  }

  /*
   * List all entries in a table
   *
   * @param table - The table to list
   * @param limit - The maximum number of entries to list
   */
  async *listTable<K, T>(
    table: string[],
    limit: number | undefined = undefined,
    offset: number | undefined = undefined
    /* */
  ): AsyncGenerator<{ key: K; value: T }> {
    this.#assertInitialised();

    // select keys from the topic in a specific numeric range
    const selector: Deno.KvListSelector = typeof offset !== 'undefined'
      ? {
        prefix: table,
        start: [...table, offset]
      }
      : { prefix: table };

    // optionally, limit the number of entries yielded.
    const options: Deno.KvListOptions = { }
    if (typeof limit !== 'undefined') {
      options.limit = limit;
    }

    for await (const entry of this.kv!.list(selector, options)) {
      yield {
        key: entry.key as K,
        value: entry.value as T,
      };
    }
  }

  /*
   * Set a value in the database
   *
   * @param table - The table to set the value in
   * @param id - The id of the value to set
   * @param value - The value to set
   */
  async setValue<T>(table: string[], id: string, value: T): Promise<void> {
    this.#assertInitialised();

    await this.kv!.set([...table, id], value);
  }

  /*
   * Set multiple values in the database
   *
   * @param rows - The rows to set, as pairs of id and value
   */
  async setValues<T>(rows: [string[], T][]): Promise<void> {
    this.#assertInitialised();

    const atom = this.kv!.atomic();

    for (const [id, value] of rows) {
      atom.set(id, value);
    }

    await atom.commit();
  }

  /*
   * Delete multiple values in the database
   *
   * @param rows - The rows to set, as pairs of id and value
   */
  async deleteValues<T>(rows: [string[], T][]): Promise<void> {
    this.#assertInitialised();

    const atom = this.kv!.atomic();

    for (const [id, value] of rows) {
      atom.set(id, value);
    }

    await atom.commit();
  }

  /*
   * Close the KV storage
   */
  async close() {
    this.#assertInitialised();

    await this.kv!.close();
  }
}
