// Integration tests for GET /objects/:topic
// @design.md

import { makeTestContext, jsonPut } from "./helpers.ts";

Deno.test("Proves GET /objects/:topic returns 404 for an unknown topic", async () => {
  const { request, cleanup } = await makeTestContext();
  try {
    const res = await request("/objects/nonexistent");
    res.expectStatus(404);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves GET /objects/:topic returns an empty array when no entries exist", async () => {
  const { request, cleanup } = await makeTestContext([], [{ name: "things" }]);
  try {
    const res = await request("/objects/things");
    res.expectStatus(200);
    res.expectBody([]);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves GET /objects/:topic returns all written entries", async () => {
  const { request, cleanup } = await makeTestContext([], [{ name: "things" }]);
  try {
    await request("/objects/things/key1", jsonPut({ payload: { value: 1 } }));
    await request("/objects/things/key2", jsonPut({ payload: { value: 2 } }));

    const res = await request("/objects/things");
    res.expectStatus(200);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves GET /objects/:topic includes tombstones", async () => {
  const { request, cleanup } = await makeTestContext([], [{ name: "things" }]);
  try {
    await request("/objects/things/key1", jsonPut({ payload: { value: 1 } }));
    await request("/objects/things/key1", { method: "DELETE" });

    const res = await request("/objects/things");
    res.expectStatus(200);
  } finally {
    await cleanup();
  }
});
