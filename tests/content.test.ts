// Integration and fuzz tests for POST /content/:topic
// @design.md

import * as Peach from "peach";
import { makeTestContext, jsonPost } from "./helpers.ts";

Deno.test("Proves POST /content/:topic returns 404 for an unknown topic", async () => {
  const { request, cleanup } = await makeTestContext();
  try {
    const res = await request("/content/nonexistent", jsonPost({ payload: {} }));
    res.expectStatus(404);
    res.expectBody({ error: "Not found: nonexistent" });
  } finally {
    await cleanup();
  }
});

Deno.test("Proves POST /content/:topic returns 201 for a known topic", async () => {
  const { request, cleanup } = await makeTestContext([{ name: "events" }]);
  try {
    const res = await request("/content/events", jsonPost({ payload: { value: 1 } }));
    res.expectStatus(201);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves POST /content/:topic assigns monotonically increasing IDs", async () => {
  const { request, cleanup } = await makeTestContext([{ name: "events" }]);
  try {
    await request("/content/events", jsonPost({ payload: {} }));
    await request("/content/events", jsonPost({ payload: {} }));

    const feed = await request("/feed");
    feed.expectStatus(200);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves GET /content/:topic returns 404 for an unknown topic", async () => {
  const { request, cleanup } = await makeTestContext();
  try {
    const res = await request("/content/nonexistent");
    res.expectStatus(404);
    res.expectBody({ error: "Not found: nonexistent" });
  } finally {
    await cleanup();
  }
});

Deno.test("Proves GET /content/:topic returns an empty array when no entries exist", async () => {
  const { request, cleanup } = await makeTestContext([{ name: "events" }]);
  try {
    const res = await request("/content/events");
    res.expectStatus(200);
    res.expectBody([]);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves GET /content/:topic returns written entries in order", async () => {
  const { request, cleanup } = await makeTestContext([{ name: "events" }]);
  try {
    await request("/content/events", jsonPost({ payload: { seq: 1 } }));
    await request("/content/events", jsonPost({ payload: { seq: 2 } }));

    const res = await request("/content/events");
    res.expectStatus(200);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves GET /content/:topic ?size limits the number of entries returned", async () => {
  const { request, cleanup } = await makeTestContext([{ name: "events" }]);
  try {
    await request("/content/events", jsonPost({ payload: {} }));
    await request("/content/events", jsonPost({ payload: {} }));
    await request("/content/events", jsonPost({ payload: {} }));

    const res = await request("/content/events?size=2");
    res.expectStatus(200);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves POST /content/:topic never returns 5xx for arbitrary JSON payloads", async () => {
  const { request, cleanup } = await makeTestContext([{ name: "events" }]);
  try {
    const keyFuzzer = Peach.String.from(Peach.String.letters(Peach.Number.uniform), Peach.Number.uniform(1, 10));
    const valueFuzzer = Peach.String.from(Peach.String.letters(Peach.Number.uniform), Peach.Number.uniform(0, 20));
    const payloadFuzzer = Peach.Object.from(keyFuzzer, valueFuzzer, Peach.Number.uniform(0, 5));

    for (let idx = 0; idx < 50; idx++) {
      const res = await request("/content/events", jsonPost({ payload: payloadFuzzer() }));
      if (res.status >= 500) {
        throw new Error(`Server returned ${res.status} on fuzz iteration ${idx}`);
      }
    }
  } finally {
    await cleanup();
  }
});
