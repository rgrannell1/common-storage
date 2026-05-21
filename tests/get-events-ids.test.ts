// Integration tests for GET /events/:topic?ids=
// @work.md

import { makeTestContext, makePersistentServer } from "./helpers.ts";

Deno.test("Proves GET /events/:topic?ids= returns 404 for an unknown topic", async () => {
  const { request, cleanup } = await makeTestContext();
  try {
    const res = await request("/events/nonexistent?ids=1,2");
    res.expectStatus(404);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves GET /events/:topic?ids= returns an empty array when no IDs match", async () => {
  const { request, cleanup } = await makeTestContext([{ name: "logs" }]);
  try {
    const res = await request("/events/logs?ids=99,100");
    res.expectStatus(200);
    res.expectBody({ entries: [], next: null });
  } finally {
    await cleanup();
  }
});

Deno.test("Proves GET /events/:topic?ids= returns only the requested entries", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "logs" }]);
  try {
    const postInit = (seq: number): RequestInit => ({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: { seq } }),
    });

    await (await fetch("/events/logs", postInit(1))).json();
    await (await fetch("/events/logs", postInit(2))).json();
    await (await fetch("/events/logs", postInit(3))).json();

    const res = await fetch("/events/logs?ids=1,3");
    const { entries } = await res.json() as { entries: Array<{ id: number }> };

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (entries.length !== 2) throw new Error(`Expected 2 entries, got ${entries.length}`);

    const ids = entries.map(entry => entry.id).sort((first, second) => first - second);
    if (ids[0] !== 1 || ids[1] !== 3) {
      throw new Error(`Expected ids [1, 3], got [${ids.join(", ")}]`);
    }
  } finally {
    await cleanup();
  }
});

Deno.test("Proves GET /events/:topic?ids= returns 400 for a malformed ids param", async () => {
  const { request, cleanup } = await makeTestContext([{ name: "logs" }]);
  try {
    const res = await request("/events/logs?ids=not-a-number");
    res.expectStatus(400);
  } finally {
    await cleanup();
  }
});
