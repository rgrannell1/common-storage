// Integration and fuzz tests for POST /events/:topic and GET /events/:topic
// @work.md

import * as Peach from "peach";
import { makeTestContext, makePersistentServer, jsonPost } from "./helpers.ts";

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
    res.expectBody({ entries: [], next: null });
  } finally {
    await cleanup();
  }
});

Deno.test("Proves GET /events/:topic returns written entries in order", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "logs" }]);
  try {
    const postInit = (seq: number): RequestInit => ({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: { seq } }),
    });

    await (await fetch("/events/logs", postInit(1))).json();
    await (await fetch("/events/logs", postInit(2))).json();

    const res = await fetch("/events/logs");
    const { entries } = await res.json() as { entries: Array<{ id: number }> };

    if (entries.length !== 2) throw new Error(`Expected 2 entries, got ${entries.length}`);
    if (entries[0].id !== 1 || entries[1].id !== 2) {
      throw new Error(`Expected ids [1, 2] in order, got [${entries[0].id}, ${entries[1].id}]`);
    }
  } finally {
    await cleanup();
  }
});

Deno.test("Proves GET /events/:topic ?size limits the number of entries returned", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "logs" }]);
  try {
    const postInit: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: {} }),
    };

    await (await fetch("/events/logs", postInit)).json();
    await (await fetch("/events/logs", postInit)).json();
    await (await fetch("/events/logs", postInit)).json();

    const res = await fetch("/events/logs?size=2");
    const { entries } = await res.json() as { entries: unknown[] };

    if (entries.length !== 2) throw new Error(`Expected 2 entries with size=2, got ${entries.length}`);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves GET /events/:topic ?start returns entries from that ID onward", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "logs" }]);
  try {
    const postInit: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: {} }),
    };

    await (await fetch("/events/logs", postInit)).json();
    await (await fetch("/events/logs", postInit)).json();
    await (await fetch("/events/logs", postInit)).json();

    // start=2 should return entries with id >= 2
    const res = await fetch("/events/logs?start=2");
    const { entries } = await res.json() as { entries: Array<{ id: number }> };

    if (entries.length !== 2) throw new Error(`Expected 2 entries with start=2, got ${entries.length}`);
    if (entries[0].id !== 2) throw new Error(`Expected first entry id=2, got ${entries[0].id}`);
  } finally {
    await cleanup();
  }
});

type NextIdCase = {
  label: string;
  writeCount: number;
  size: number;
  expectedNext: number | null;
};

const NEXT_ID_CASES: NextIdCase[] = [
  // full page: server cannot tell if more entries exist, so next points past last returned id
  { label: "full page → next points past last entry", writeCount: 3, size: 2, expectedNext: 3 },
  // partial page: fewer entries than requested, topic is exhausted
  { label: "partial page → next is null",             writeCount: 3, size: 4, expectedNext: null },
  // exact fit: server still cannot distinguish end-of-topic from a full page without a lookahead read
  { label: "exact fit → next is non-null",            writeCount: 3, size: 3, expectedNext: 4 },
];

for (const { label, writeCount, size, expectedNext } of NEXT_ID_CASES) {
  Deno.test(`Proves GET /events/:topic next id — ${label}`, async () => {
    const { fetch, cleanup } = await makePersistentServer([{ name: "logs" }]);
    try {
      const postInit: RequestInit = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: {} }),
      };

      for (let idx = 0; idx < writeCount; idx++) {
        await (await fetch("/events/logs", postInit)).json();
      }

      const res = await fetch(`/events/logs?size=${size}`);
      const { next } = await res.json() as { next: number | null };

      if (next !== expectedNext) {
        throw new Error(`Expected next=${expectedNext}, got next=${next}`);
      }
    } finally {
      await cleanup();
    }
  });
}

Deno.test("Proves GET /events/:topic next id can be used to continue pagination", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "logs" }]);
  try {
    const postInit: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: {} }),
    };

    for (let idx = 0; idx < 4; idx++) {
      await (await fetch("/events/logs", postInit)).json();
    }

    const page1 = await (await fetch("/events/logs?size=2")).json() as { entries: Array<{ id: number }>; next: number | null };
    if (page1.entries.length !== 2) throw new Error(`Page 1: expected 2 entries, got ${page1.entries.length}`);
    if (page1.next === null) throw new Error("Page 1: expected non-null next");

    // Page 2 returns exactly size=2 entries, so next is non-null — server cannot distinguish end-of-topic from a full page
    const page2 = await (await fetch(`/events/logs?size=2&start=${page1.next}`)).json() as { entries: Array<{ id: number }>; next: number | null };
    if (page2.entries.length !== 2) throw new Error(`Page 2: expected 2 entries, got ${page2.entries.length}`);
    if (page2.next === null) throw new Error("Page 2: expected non-null next (exact fit, lookahead required to confirm end)");

    // Page 3 is empty — confirms topic is exhausted
    const page3 = await (await fetch(`/events/logs?size=2&start=${page2.next}`)).json() as { entries: Array<{ id: number }>; next: number | null };
    if (page3.entries.length !== 0) throw new Error(`Page 3: expected 0 entries, got ${page3.entries.length}`);
    if (page3.next !== null) throw new Error(`Page 3: expected null next, got ${page3.next}`);

    const allIds = [...page1.entries, ...page2.entries].map(entry => entry.id);
    if (allIds.join(",") !== "1,2,3,4") throw new Error(`Expected ids 1,2,3,4 across pages, got ${allIds.join(",")}`);
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
