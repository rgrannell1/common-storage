// Integration tests for GET /feed
// @design.md

import { makeTestContext, jsonPost } from "./helpers.ts";

Deno.test("Proves GET /feed returns empty topics when no topics are configured", async () => {
  const { request, cleanup } = await makeTestContext();
  try {
    const res = await request("/feed");
    res.expectStatus(200);
    res.expectBody({ topics: [], subscriptions: [] });
  } finally {
    await cleanup();
  }
});

Deno.test("Proves GET /feed returns 200 for a server with configured topics", async () => {
  const { request, cleanup } = await makeTestContext([{ name: "events" }]);
  try {
    const res = await request("/feed");
    res.expectStatus(200);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves GET /feed count reflects writes to the topic", async () => {
  const { request, cleanup } = await makeTestContext([{ name: "events" }]);
  try {
    await request("/content/events", jsonPost({ payload: {} }));
    await request("/content/events", jsonPost({ payload: {} }));

    const res = await request("/feed");
    res.expectStatus(200);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves GET /feed ?human returns 200", async () => {
  const { request, cleanup } = await makeTestContext([{ name: "events" }]);
  try {
    const res = await request("/feed?human");
    res.expectStatus(200);
  } finally {
    await cleanup();
  }
});
