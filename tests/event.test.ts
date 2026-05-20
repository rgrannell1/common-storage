// Integration tests for GET /events/:topic/:id
// @design.md

import { makeTestContext, jsonPost } from "./helpers.ts";

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
  const { request, cleanup } = await makeTestContext([{ name: "logs" }]);
  try {
    await request("/events/logs", jsonPost({ payload: { value: 42 } }));

    // fresh backend assigns ID 1 to the first write
    const res = await request("/events/logs/1");
    res.expectStatus(200);
  } finally {
    await cleanup();
  }
});
