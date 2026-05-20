// Integration tests for PUT /objects/:topic/:id
// @design.md

import { makeTestContext, jsonPut } from "./helpers.ts";

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
  const { request, cleanup } = await makeTestContext([], [{ name: "things" }]);
  try {
    const res = await request("/objects/things/key1", jsonPut({ payload: { value: 1 } }));
    res.expectStatus(200);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves PUT /objects/:topic/:id returns 200 when updating an existing entry", async () => {
  const { request, cleanup } = await makeTestContext([], [{ name: "things" }]);
  try {
    await request("/objects/things/key1", jsonPut({ payload: { value: 1 } }));
    const res = await request("/objects/things/key1", jsonPut({ payload: { value: 2 } }));
    res.expectStatus(200);
  } finally {
    await cleanup();
  }
});
