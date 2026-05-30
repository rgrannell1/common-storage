// Integration tests for GET /feed
// @work.md

import { makeTestContext, makePersistentServer, discard } from "./helpers.ts";

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
  const { fetch, cleanup } = await makePersistentServer([{ name: "events" }]);
  try {
    const postInit: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: {} }),
    };
    await discard(await fetch("/events/events", postInit));
    await discard(await fetch("/events/events", postInit));

    const res = await fetch("/feed");
    const body = await res.json() as { topics: { topic: string; count: number }[] };

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const topicCount = body.topics[0].count;
    if (topicCount !== 2) throw new Error(`Expected count 2, got ${topicCount}`);
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
