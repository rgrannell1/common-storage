// Integration tests for GET /events/:topic?ids=
// @design.md

import { makeTestContext, jsonPost } from "./helpers.ts";

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
    res.expectBody([]);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves GET /events/:topic?ids= returns only the requested entries", async () => {
  const { request, cleanup } = await makeTestContext([{ name: "logs" }]);
  try {
    await request("/events/logs", jsonPost({ payload: { seq: 1 } }));
    await request("/events/logs", jsonPost({ payload: { seq: 2 } }));
    await request("/events/logs", jsonPost({ payload: { seq: 3 } }));

    const res = await request("/events/logs?ids=1,3");
    res.expectStatus(200);
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
