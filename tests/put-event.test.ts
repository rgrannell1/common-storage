// Integration tests for PUT /events/:topic/:id
// @work.md

import { makeTestContext, makePersistentServer, discard, jsonPost, jsonPut } from "./helpers.ts";

Deno.test("Proves PUT /events/:topic/:id returns 404 for an unknown topic", async () => {
  const { request, cleanup } = await makeTestContext();
  try {
    const res = await request("/events/nonexistent/1", jsonPut({ payload: {} }));
    res.expectStatus(404);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves PUT /events/:topic/:id returns 404 for a missing entry", async () => {
  const { request, cleanup } = await makeTestContext([{ name: "logs" }]);
  try {
    const res = await request("/events/logs/999", jsonPut({ payload: {} }));
    res.expectStatus(404);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves PUT /events/:topic/:id returns 200 and updates the entry", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "logs" }]);
  try {
    await discard(await fetch("/events/logs", jsonPost({ payload: { value: 1 } })));

    const res = await fetch("/events/logs/1", jsonPut({ payload: { value: 2 } }));
    const entry = await res.json() as { payload: { value: number } };

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (entry.payload.value !== 2) throw new Error(`Expected payload.value 2, got ${entry.payload.value}`);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves PUT /events/:topic/:id GET after update reflects new payload", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "logs" }]);
  try {
    await discard(await fetch("/events/logs", jsonPost({ payload: { value: 1 } })));
    await discard(await fetch("/events/logs/1", jsonPut({ payload: { value: 2 } })));

    const res = await fetch("/events/logs/1");
    const entry = await res.json() as { payload: { value: number } };

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (entry.payload.value !== 2) throw new Error(`Expected payload.value 2 after update, got ${entry.payload.value}`);
  } finally {
    await cleanup();
  }
});
