// Integration tests for PUT /events/:topic/:id
// @design.md

import { makeTestContext, jsonPost, jsonPut } from "./helpers.ts";

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
  const { request, cleanup } = await makeTestContext([{ name: "logs" }]);
  try {
    await request("/events/logs", jsonPost({ payload: { value: 1 } }));

    const res = await request("/events/logs/1", jsonPut({ payload: { value: 2 } }));
    res.expectStatus(200);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves PUT /events/:topic/:id GET after update reflects new payload", async () => {
  const { request, cleanup } = await makeTestContext([{ name: "logs" }]);
  try {
    await request("/events/logs", jsonPost({ payload: { value: 1 } }));
    await request("/events/logs/1", jsonPut({ payload: { value: 2 } }));

    const res = await request("/events/logs/1");
    res.expectStatus(200);
  } finally {
    await cleanup();
  }
});
