import {
  assert,
  assertEquals,
  assertObjectMatch,
} from "https://deno.land/std@0.158.0/testing/asserts.ts";

import { Sqlite } from "../src/storage/sqlite/sqlite.ts";
import { IStorage } from "../src/interfaces/storage.ts";

export async function missingTopicFailure(topic: string, storage: IStorage) {
  try {
    await storage.getTopic(topic);
    throw new Error("did not throw exception for missing topic");
  } catch (_) {
    // all good
  }
}

await Deno.test({
  name: "Sqlite | missing topics throw exceptions",
  fn: async () => {
    const storage = new Sqlite(":memory:");
    await storage.init();

    await missingTopicFailure("foo", storage);

    await storage.close();
  },
});

await Deno.test({
  name: "Sqlite | topics can be persisted",
  fn: async () => {
    const storage = new Sqlite(":memory:");
    await storage.init();

    await missingTopicFailure("foo", storage);
    let res = await storage.addTopic("foo", "hello!");

    assert(res.existed === false);
    res = await storage.addTopic("foo", "hello!");
    assert(res.existed === true);

    await storage.close();
  },
});

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
