/*
 * A cache for reducing reads from Deno KV's aggressively billed APIs.
 */
export class Cache<T> {
  store: Map<string, T>;
  stats: {
    reads: number;
    readMisses: number;
    writes: number;
    clears: number;
  }

  constructor() {
    this.store = new Map<string, T>();
    this.stats = {
      reads: 0,
      readMisses: 0,
      writes: 0,
      clears: 0
    }
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  get(key: string): T | undefined {
    this.stats.reads++;

    return this.store.get(key);
  }

  set(key: string, value: T): void {
    this.stats.writes++;

    this.store.set(key, value);
  }

  clear(predicate: (key: string) => boolean) {
    for (const key of this.store.keys()) {
      if (predicate(key)) {
        this.stats.clears++;
        this.store.delete(key);
      }
    }
  }
}

/*
 * Configuration describing how to cache a function
 *
 */
export type CacheOpts<T> = {
  id?(...args: any[]): string;
  clears?: (...args: any[]) => (key: string) => boolean;
  store: Cache<T>;
};

/*
 * Wrap a function with a cache; cache and clear the cache based on
 * the configuration in `CachedOpts`
 *
 */
export function cached<T>(opts: CacheOpts<T>, fn: Function): Function {
  return function(...args: any[]) {

    if (opts.id) {
      const cacheId = opts.id(...args);

      if (opts.store.has(cacheId)) {
        return opts.store.get(cacheId);
      }

      opts.store.stats.readMisses++;
      const result = fn.apply(this, args);

      opts.store.set(cacheId, result);

      return result;
    }

    if (opts.clears) {
      const predicate = opts.clears(...args);
      opts.store.clear(predicate);
    }

    opts.store.stats.readMisses++;
    return fn.apply(this, args);
  }
}
