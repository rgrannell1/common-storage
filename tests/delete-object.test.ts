// Integration tests for DELETE /objects/:topic/:id
// @work.md

import { makeTestContext, makePersistentServer, jsonPut } from "./helpers.ts";

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

Deno.test("Proves DELETE /objects/:topic/:id tombstone is readable via GET with payload null", async () => {
  const { fetch, cleanup } = await makePersistentServer([], [{ name: "things" }]);
  try {
    await (await fetch("/objects/things/key1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: { value: 1 } }),
    })).json();
    await (await fetch("/objects/things/key1", { method: "DELETE" })).json();

    const res = await fetch("/objects/things/key1");
    const entry = await res.json() as { payload: unknown };

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (entry.payload !== null) throw new Error(`Expected payload null for tombstone, got ${JSON.stringify(entry.payload)}`);
  } finally {
    await cleanup();
  }
});
