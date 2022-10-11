import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.158.0/testing/asserts.ts";

import { Sqlite } from "../src/storage/sqlite/sqlite.ts";

await Deno.test({
  name: "Sqlite | topics can be retrieved",
  fn: async () => {
    const storage = new Sqlite(":memory:");
    await storage.init();

    await storage.addTopic("foo", "hello!");

    const res = await storage.getTopic("foo");
    assert(res.name === "foo");
    assert(res.description === "hello!");
    assert(res.hasOwnProperty("created"));

    await storage.close();
  },
});

await Deno.test({
  name: "Sqlite | topics returns error when absent",
  fn: async () => {
    const storage = new Sqlite(":memory:");
    await storage.init();

    let noFail = false;

    try {
      await storage.getTopic("foo");
      noFail = true;
    } catch (_) {
      // all good!
    }

    assert(!noFail);

    await storage.close();
  },
});

await Deno.test({
  name: "Sqlite | topics returns error when absent",
  fn: async () => {
    const storage = new Sqlite(":memory:");
    await storage.init();

    await storage.addTopic("foo", "hello!");
    const res = await storage.getTopicNames();

    assertEquals(res.length, 1);
    assertEquals(res[0], "foo");
  },
});
