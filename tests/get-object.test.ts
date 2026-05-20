// Integration tests for GET /objects/:topic/:id
// @design.md

import { makeTestContext, jsonPut } from "./helpers.ts";

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
  const { request, cleanup } = await makeTestContext([], [{ name: "things" }]);
  try {
    await request("/objects/things/key1", jsonPut({ payload: { value: 42 } }));

    const res = await request("/objects/things/key1");
    res.expectStatus(200);
  } finally {
    await cleanup();
  }
});
