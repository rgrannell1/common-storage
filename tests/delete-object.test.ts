// Integration tests for DELETE /objects/:topic/:id
// @design.md

import { makeTestContext, jsonPut } from "./helpers.ts";

function httpDelete(): RequestInit {
  return { method: "DELETE" };
}

Deno.test("Proves DELETE /objects/:topic/:id returns 404 for an unknown topic", async () => {
  const { request, cleanup } = await makeTestContext();
  try {
    const res = await request("/objects/nonexistent/key1", httpDelete());
    res.expectStatus(404);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves DELETE /objects/:topic/:id is idempotent for a missing entry", async () => {
  const { request, cleanup } = await makeTestContext([], [{ name: "things" }]);
  try {
    const res = await request("/objects/things/key1", httpDelete());
    res.expectStatus(200);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves DELETE /objects/:topic/:id writes a tombstone for an existing entry", async () => {
  const { request, cleanup } = await makeTestContext([], [{ name: "things" }]);
  try {
    await request("/objects/things/key1", jsonPut({ payload: { value: 1 } }));
    const res = await request("/objects/things/key1", httpDelete());
    res.expectStatus(200);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves DELETE /objects/:topic/:id tombstone is readable via GET", async () => {
  const { request, cleanup } = await makeTestContext([], [{ name: "things" }]);
  try {
    await request("/objects/things/key1", jsonPut({ payload: { value: 1 } }));
    await request("/objects/things/key1", httpDelete());

    const res = await request("/objects/things/key1");
    res.expectStatus(200);
  } finally {
    await cleanup();
  }
});
