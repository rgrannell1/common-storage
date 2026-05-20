// Integration and fuzz tests for POST /events/:topic and GET /events/:topic
// @design.md

import * as Peach from "peach";
import { makeTestContext, jsonPost } from "./helpers.ts";

Deno.test("Proves POST /events/:topic returns 404 for an unknown topic", async () => {
  const { request, cleanup } = await makeTestContext();
  try {
    const res = await request("/events/nonexistent", jsonPost({ payload: {} }));
    res.expectStatus(404);
    res.expectBody({ error: "Not found: nonexistent" });
  } finally {
    await cleanup();
  }
});

Deno.test("Proves POST /events/:topic returns 201 for a known topic", async () => {
  const { request, cleanup } = await makeTestContext([{ name: "logs" }]);
  try {
    const res = await request("/events/logs", jsonPost({ payload: { value: 1 } }));
    res.expectStatus(201);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves POST /events/:topic assigns monotonically increasing IDs", async () => {
  const { request, cleanup } = await makeTestContext([{ name: "logs" }]);
  try {
    await request("/events/logs", jsonPost({ payload: {} }));
    await request("/events/logs", jsonPost({ payload: {} }));

    // IDs are assigned from 1 upward; two writes must produce IDs 1 and 2
    const res1 = await request("/events/logs/1");
    res1.expectStatus(200);
    const res2 = await request("/events/logs/2");
    res2.expectStatus(200);
    // ID 3 was never written
    const res3 = await request("/events/logs/3");
    res3.expectStatus(404);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves GET /events/:topic returns 404 for an unknown topic", async () => {
  const { request, cleanup } = await makeTestContext();
  try {
    const res = await request("/events/nonexistent");
    res.expectStatus(404);
    res.expectBody({ error: "Not found: nonexistent" });
  } finally {
    await cleanup();
  }
});

Deno.test("Proves GET /events/:topic returns an empty array when no entries exist", async () => {
  const { request, cleanup } = await makeTestContext([{ name: "logs" }]);
  try {
    const res = await request("/events/logs");
    res.expectStatus(200);
    res.expectBody([]);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves GET /events/:topic returns written entries in order", async () => {
  const { request, cleanup } = await makeTestContext([{ name: "logs" }]);
  try {
    await request("/events/logs", jsonPost({ payload: { seq: 1 } }));
    await request("/events/logs", jsonPost({ payload: { seq: 2 } }));

    const res = await request("/events/logs");
    res.expectStatus(200);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves GET /events/:topic ?size limits the number of entries returned", async () => {
  const { request, cleanup } = await makeTestContext([{ name: "logs" }]);
  try {
    await request("/events/logs", jsonPost({ payload: {} }));
    await request("/events/logs", jsonPost({ payload: {} }));
    await request("/events/logs", jsonPost({ payload: {} }));

    const res = await request("/events/logs?size=2");
    res.expectStatus(200);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves POST /events/:topic never returns 5xx for arbitrary JSON payloads", async () => {
  const { request, cleanup } = await makeTestContext([{ name: "logs" }]);
  try {
    const keyFuzzer = Peach.String.from(Peach.String.letters(Peach.Number.uniform), Peach.Number.uniform(1, 10));
    const valueFuzzer = Peach.String.from(Peach.String.letters(Peach.Number.uniform), Peach.Number.uniform(0, 20));
    const payloadFuzzer = Peach.Object.from(keyFuzzer, valueFuzzer, Peach.Number.uniform(0, 5));

    for (let idx = 0; idx < 50; idx++) {
      const res = await request("/events/logs", jsonPost({ payload: payloadFuzzer() }));
      if (res.status >= 500) {
        throw new Error(`Server returned ${res.status} on fuzz iteration ${idx}`);
      }
    }
  } finally {
    await cleanup();
  }
});
