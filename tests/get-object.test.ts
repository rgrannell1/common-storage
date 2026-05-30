// Integration tests for GET /objects/:topic/:id
// @work.md

import { makeTestContext, makePersistentServer, discard, jsonPut } from "./helpers.ts";

Deno.test("Proves GET /objects/:topic/:id returns 404 for an unknown topic", async () => {
  const { request, cleanup } = await makeTestContext();
  try {
    const res = await request("/objects/nonexistent/key1");
    res.expectStatus(404);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves GET /objects/:topic/:id returns 404 for a missing entry", async () => {
  const { request, cleanup } = await makeTestContext([], [{ name: "things" }]);
  try {
    const res = await request("/objects/things/key1");
    res.expectStatus(404);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves GET /objects/:topic/:id returns a written entry", async () => {
  const { fetch, cleanup } = await makePersistentServer([], [{ name: "things" }]);
  try {
    await discard(await fetch("/objects/things/key1", jsonPut({ payload: { value: 42 } })));

    const res = await fetch("/objects/things/key1");
    const entry = await res.json() as { id: string; payload: { value: number } };

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (entry.id !== "key1") throw new Error(`Expected id "key1", got "${entry.id}"`);
    const payloadValue = entry.payload.value;
    if (payloadValue !== 42) throw new Error(`Expected payload.value 42, got ${payloadValue}`);
  } finally {
    await cleanup();
  }
});
