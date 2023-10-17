import {
  assert,
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.198.0/assert/mod.ts";
import { KVStorage } from "./kv-storage.ts";

// +++ ROLE +++ //

Deno.test({
  name: "addRole(x) -> getRole(x) is x",
  async fn() {
    const tmp = await Deno.makeTempFile();
    const store = new KVStorage(tmp);
    await store.init();

    const permissions = [{
      routes: "ALL",
      topics: "ALL",
    }];
    const addResult = await store.addRole("test", permissions);

    assertEquals(addResult.existed, false);

    const getResult = await store.getRole("test");
    assertEquals(getResult!.name, "test");
    assertEquals(getResult!.permissions, permissions);

    const restoreResult = await store.addRole("test", permissions);

    assertEquals(restoreResult.existed, true);
    await store.close();
  },
});

// +++ TOPIC +++ //

Deno.test({
  name: "setTopic(x) -> getTopic(x) is x",
  async fn() {
    const tmp = await Deno.makeTempFile();
    const store = new KVStorage(tmp);
    await store.init();

    const addResult = await store.addTopic(
      "test",
      "myuser",
      "test description",
      undefined,
    );

    assertEquals(addResult.existed, false);

    const getResult = await store.getTopic("test");
    assertEquals(getResult!.name, "test");
    assertEquals(getResult!.description, "test description");
    assert(getResult!.hasOwnProperty("created"));

    const restoreResult = await store.addTopic(
      "test",
      "myuser",
      "test description",
      undefined,
    );

    assertEquals(restoreResult.existed, true);
    await store.close();
  },
});

Deno.test({
  name: "getTopicNames() returns expected topics",
  async fn() {
    const tmp = await Deno.makeTempFile();
    const store = new KVStorage(tmp);
    await store.init();

    await store.addTopic("test0", "myuser", "test description", undefined);
    await store.addTopic("test1", "myuser", "test description", undefined);

    const topics = await store.getTopicNames();
    assertEquals(topics, ["test0", "test1"]);
    await store.close();
  },
});

Deno.test({
  name: "addTopic(x) => addContent(x) rejects invalid case",
  async fn() {
    const tmp = await Deno.makeTempFile();
    const store = new KVStorage(tmp);
    await store.init();

    await store.addTopic("test", "myuser", "test description", {
      type: "integer",
    });

    await assertRejects(
      async () => {
        await store.addContent(undefined, "test", [
          "1",
        ]);
      },
      Error,
      "must be integer",
    );

    await store.close();
  },
});

Deno.test({
  name: "setTopic(x) -> deleteTopic(x) removes topic",
  async fn() {
    const tmp = await Deno.makeTempFile();
    const store = new KVStorage(tmp);
    await store.init();

    await store.addTopic("test", "myuser", "test description", undefined);

    const firstDeleteResult = await store.deleteTopic("test");
    assertEquals(firstDeleteResult.existed, true);

    const secondDeleteResult = await store.deleteTopic("test");
    assertEquals(secondDeleteResult.existed, false);

    await store.close();
  },
});

// +++ CONTENT +++ //
Deno.test({
  name: "getContent()",
  async fn() {
    const tmp = await Deno.makeTempFile();
    const store = new KVStorage(tmp);
    await store.init();

    await store.addTopic("testing", "myuser", "test description", {
      "type": "integer",
    });
    const addResult = await store.addContent("test-batch", "testing", [
      0,
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
    ]);

    const batchStatus = await store.getBatch("test-batch");
    assertEquals(batchStatus.id, "test-batch");
    assertEquals(batchStatus.status, "open");

    const content = await store.addContent("test-batch", "testing", []);
    assert(content.hasOwnProperty("lastId"));

    const closedBatchStatus = await store.getBatch("test-batch");
    assertEquals(closedBatchStatus.id, "test-batch");
    assertEquals(closedBatchStatus.status, "closed");

    const firstGet = await store.getContent("testing");
    assertEquals(firstGet.topic, "testing");

    assertEquals(firstGet.startId, 0);
    assertEquals(firstGet.lastId, 9);
    assertEquals(firstGet.nextId, 10);
    assertEquals(firstGet.content, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

    const secondGet = await store.getContent("testing", firstGet.nextId);

    assertEquals(secondGet.startId, 10);
    assertEquals(secondGet.lastId, 12);
    assertEquals(secondGet.nextId, 13);
    assertEquals(secondGet.content, [10, 11, 12]);

    await store.close();
  },
});

Deno.test({
  name: "getTopicStats",
  async fn() {
    const tmp = await Deno.makeTempFile();
    const store = new KVStorage(tmp);
    await store.init();

    await store.addTopic("testing-2", "myuser", "test description", {
      type: "string",
    });

    const content = await store.addContent(undefined, "testing-2", [
      "a",
      "b",
      "c",
    ]);
    const stats = await store.getTopicStats("testing-2");

    assertEquals(stats.topic, "testing-2");
    assertEquals(stats.stats.count, 3);

    await store.close();
  },
});
