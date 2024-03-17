import { assertEquals } from "https://deno.land/std@0.198.0/assert/mod.ts";

import { Cache, cache } from "./cache.ts";

const testCache = new Cache<string>();
class TestClass {
  @cache({
    id(x: number, y: number, z: number) {
      return `${x}/${y}/${z}`;
    },
    store: testCache,
  })
  first(x: number, y: number, z: number) {
    return `${x}/${y}/${z}`;
  }
}

Deno.test("cache | actually uses the cache", () => {
  const inst = new TestClass();
  const result = inst.first(1, 2, 3);

  assertEquals(result, "1/2/3");
});
