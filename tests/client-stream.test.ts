// Regression tests for CmstrClient NDJSON streaming — proves the client yields stream
// entries without eagerly consuming the response body. Guards against a past regression where
// `await response.json()` ran on the success path and hung the unbounded tailing stream.
// @work.md

import { assertEquals } from "@std/assert";
import { CmstrClient } from "../clients/ts/mod.ts";
import type { EventEntry, ObjectEntry } from "../clients/ts/mod.ts";
import { jsonPost, jsonPut, makePersistentServer, TEST_TOKEN } from "./helpers.ts";

// Upper bound on how long a stream may take to yield the seeded entries. The past bug hung the
// stream forever, so a bounded race turns any recurrence into a fast, clearly-labelled failure
// instead of a stalled suite.
const STREAM_TIMEOUT_MS = 5_000;

// Reads exactly `count` items from an async generator, then closes it.
async function takeFromStream<Item>(stream: AsyncGenerator<Item>, count: number): Promise<Item[]> {
  const items: Item[] = [];
  for await (const item of stream) {
    items.push(item);
    if (items.length >= count) break;
  }
  return items;
}

// Races `work` against a timeout so a hung stream fails fast instead of stalling the suite.
function withTimeout<Value>(work: Promise<Value>, label: string): Promise<Value> {
  work.catch(() => {}); // swallow a late rejection if the timeout wins the race
  let timer: number | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    const message = `${label} did not yield within ${STREAM_TIMEOUT_MS}ms — body consumed eagerly?`;
    timer = setTimeout(() => reject(new Error(message)), STREAM_TIMEOUT_MS);
  });
  const cancelTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
  };
  return Promise.race([work, timeout]).finally(cancelTimer);
}

Deno.test(
  "Proves CmstrClient.streamEvents yields entries without consuming the body eagerly",
  async () => {
  const { url, fetch, cleanup } = await makePersistentServer([{ name: "logs" }]);
  const controller = new AbortController();
  try {
    for (let idx = 0; idx < 3; idx++) {
      await (await fetch("/events/logs", jsonPost({ payload: { idx } }))).json();
    }

    const client = new CmstrClient({ url, token: TEST_TOKEN });
    const stream = client.streamEvents({ topic: "logs", start: 1, signal: controller.signal });
    const entries = await withTimeout(takeFromStream<EventEntry>(stream, 3), "streamEvents");

    assertEquals(entries.length, 3);
    assertEquals(entries.map(entry => entry.id), [1, 2, 3]);
  } finally {
    controller.abort();
    await cleanup();
  }
});

Deno.test(
  "Proves CmstrClient.streamObjects yields entries without consuming the body eagerly",
  async () => {
  const { url, fetch, cleanup } = await makePersistentServer([], [{ name: "notes" }]);
  const controller = new AbortController();
  try {
    for (const key of ["a", "b", "c"]) {
      await (await fetch(`/objects/notes/${key}`, jsonPut({ payload: { key } }))).json();
    }

    const client = new CmstrClient({ url, token: TEST_TOKEN });
    const stream = client.streamObjects({ topic: "notes", start: 1, signal: controller.signal });
    const entries = await withTimeout(takeFromStream<ObjectEntry>(stream, 3), "streamObjects");

    assertEquals(entries.length, 3);
    assertEquals(entries.map(entry => entry.id).sort(), ["a", "b", "c"]);
  } finally {
    controller.abort();
    await cleanup();
  }
});
