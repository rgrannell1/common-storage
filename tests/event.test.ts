// Integration tests for GET /events/:topic/:id
// @work.md

import { makeTestContext, makePersistentServer, discard, jsonPost } from "./helpers.ts";

Deno.test("Proves GET /events/:topic/:id returns 404 for an unknown topic", async () => {
  const { request, cleanup } = await makeTestContext();
  try {
    const res = await request("/events/nonexistent/1");
    res.expectStatus(404);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves GET /events/:topic/:id returns 404 for a missing entry", async () => {
  const { request, cleanup } = await makeTestContext([{ name: "logs" }]);
  try {
    const res = await request("/events/logs/999");
    res.expectStatus(404);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves GET /events/:topic/:id returns a written entry", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "logs" }]);
  try {
    await discard(await fetch("/events/logs", jsonPost({ payload: { value: 42 } })));

    const res = await fetch("/events/logs/1");
    const entry = await res.json() as { id: number; payload: { value: number } };

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (entry.id !== 1) throw new Error(`Expected id 1, got ${entry.id}`);
    const payloadValue = entry.payload.value;
    if (payloadValue !== 42) throw new Error(`Expected payload.value 42, got ${payloadValue}`);
  } finally {
    await cleanup();
  }
});
