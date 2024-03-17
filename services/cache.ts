/*
 * A cache for reducing reads from Deno KV's aggressively billed APIs.
 */
export class Cache<T> {
  store: Map<string, T>;

  constructor() {
    this.store = new Map<string, T>();
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  get(key: string): T | undefined {
    return this.store.get(key);
  }

  set(key: string, value: T): void {
    this.store.set(key, value);
  }

  clear(predicate: (key: string) => boolean) {
    for (const key of this.store.keys()) {
      if (predicate(key)) {
        this.store.delete(key);
      }
    }
  }
}

export type CacheOpts<T> = {
  id?(...args: any[]): string;
  clears?: (...args: any[]) => (key: string) => boolean;
  store: Cache<T>;
};

/* */
export function cache<T>(opts: CacheOpts<T>) {
  return function (target: any, propertyKey: string) {
    const originalMethod = target[propertyKey];

    target[propertyKey] = async function (...args: any[]) {
      if (opts.id) {
        const cacheId = opts.id(...args);

        if (opts.store.has(cacheId)) {
          return opts.store.get(cacheId);
        }

        const result = originalMethod.apply(this, args);

        opts.store.set(cacheId, result);

        return result;
      }

      if (opts.clears) {
        const predicate = opts.clears(...args);
        opts.store.clear(predicate);
      }

      return originalMethod.apply(this, args);
    };
  };
}
