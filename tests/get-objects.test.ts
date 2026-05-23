// Integration tests for GET /objects/:topic
// @work.md

import { makeTestContext, makePersistentServer, discard } from "./helpers.ts";

Deno.test("Proves GET /objects/:topic returns 400 for start=0", async () => {
  const { fetch, cleanup } = await makePersistentServer([], [{ name: "things" }]);
  try {
    const res = await fetch("/objects/things?start=0");
    await discard(res);
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  } finally {
    await cleanup();
  }
});

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
  const { fetch, cleanup } = await makePersistentServer([], [{ name: "things" }]);
  try {
    const putInit = (payload: unknown): RequestInit => ({
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload }),
    });

    await (await fetch("/objects/things/key1", putInit({ value: 1 }))).json();
    await (await fetch("/objects/things/key2", putInit({ value: 2 }))).json();

    const res = await fetch("/objects/things");
    const entries = await res.json() as Array<{ id: string }>;

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (entries.length !== 2) throw new Error(`Expected 2 entries, got ${entries.length}`);

    const ids = entries.map(entry => entry.id).sort();
    if (ids[0] !== "key1" || ids[1] !== "key2") {
      throw new Error(`Expected ids [key1, key2], got [${ids.join(", ")}]`);
    }
  } finally {
    await cleanup();
  }
});

Deno.test("Proves GET /objects/:topic includes tombstones with payload null", async () => {
  const { fetch, cleanup } = await makePersistentServer([], [{ name: "things" }]);
  try {
    await (await fetch("/objects/things/key1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: { value: 1 } }),
    })).json();
    await (await fetch("/objects/things/key1", { method: "DELETE" })).json();

    const res = await fetch("/objects/things");
    const entries = await res.json() as Array<{ id: string; payload: unknown }>;

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);

    const tombstone = entries.find(entry => entry.id === "key1");
    if (!tombstone) throw new Error("Expected tombstone entry for key1 to be present");
    if (tombstone.payload !== null) throw new Error(`Expected tombstone payload to be null, got ${JSON.stringify(tombstone.payload)}`);
  } finally {
    await cleanup();
  }
});
