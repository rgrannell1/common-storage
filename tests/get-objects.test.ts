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

Deno.test("Proves GET /objects/:topic returns an empty page when no entries exist", async () => {
  const { request, cleanup } = await makeTestContext([], [{ name: "things" }]);
  try {
    const res = await request("/objects/things");
    res.expectStatus(200);
    res.expectBody({ entries: [], next: null });
  } finally {
    await cleanup();
  }
});

Deno.test(
  "Proves GET /objects/:topic returns all written entries as a paginated page",
  async () => {
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
    const body = await res.json() as { entries: Array<{ id: string }>; next: number | null };

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const entriesLength = body.entries.length;
    if (entriesLength !== 2) throw new Error(`Expected 2 entries, got ${entriesLength}`);

    const ids = body.entries.map(entry => entry.id).sort();
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
    type ObjectEntry = { id: string; payload: unknown };
    type PageBody = { entries: ObjectEntry[]; next: number | null };
    const body = await res.json() as PageBody;

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);

    const tombstone = body.entries.find(entry => entry.id === "key1");
    if (!tombstone) throw new Error("Expected tombstone entry for key1 to be present");
    if (tombstone.payload !== null) {
      const tombstonePayload = JSON.stringify(tombstone.payload);
      throw new Error(`Expected tombstone payload to be null, got ${tombstonePayload}`);
    }
  } finally {
    await cleanup();
  }
});
