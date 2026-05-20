// Integration tests for PUT /objects/:topic/:id
// @work.md

import { makeTestContext, makePersistentServer, jsonPut } from "./helpers.ts";

Deno.test("Proves PUT /objects/:topic/:id returns 404 for an unknown topic", async () => {
  const { request, cleanup } = await makeTestContext();
  try {
    const res = await request("/objects/nonexistent/key1", jsonPut({ payload: {} }));
    res.expectStatus(404);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves PUT /objects/:topic/:id returns 200 for a new entry", async () => {
  const { fetch, cleanup } = await makePersistentServer([], [{ name: "things" }]);
  try {
    const res = await fetch("/objects/things/key1", jsonPut({ payload: { value: 1 } }));
    const entry = await res.json() as { id: string; payload: { value: number } };

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (entry.id !== "key1") throw new Error(`Expected id "key1", got "${entry.id}"`);
    if (entry.payload.value !== 1) throw new Error(`Expected payload.value 1, got ${entry.payload.value}`);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves PUT /objects/:topic/:id returns 200 when updating an existing entry", async () => {
  const { fetch, cleanup } = await makePersistentServer([], [{ name: "things" }]);
  try {
    await fetch("/objects/things/key1", jsonPut({ payload: { value: 1 } }));
    const res = await fetch("/objects/things/key1", jsonPut({ payload: { value: 2 } }));
    const entry = await res.json() as { payload: { value: number } };

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (entry.payload.value !== 2) throw new Error(`Expected payload.value 2, got ${entry.payload.value}`);
  } finally {
    await cleanup();
  }
});
