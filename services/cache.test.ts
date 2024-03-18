import { assertEquals } from "https://deno.land/std@0.198.0/assert/mod.ts";

import { Cache, cached } from "./cache.ts";

Deno.test("cache | actually uses the cache", () => {
  const testCache = new Cache<number>();
  const test = cached<number>({
    store: testCache,
    id:(x: number, y: number) => `${x}/${y}`
  }, (x: number, y: number) => x + y);

  assertEquals(test(1, 2), 3);
});
