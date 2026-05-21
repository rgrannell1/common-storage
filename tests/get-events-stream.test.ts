// Integration tests for GET /events/:topic NDJSON streaming
// @work.md

import { makePersistentServer, jsonPost } from "./helpers.ts";

async function readNdjsonLines(body: ReadableStream<Uint8Array>, count: number): Promise<unknown[]> {
  const results: unknown[] = [];
  let buffer = "";

  const reader = body.pipeThrough(new TextDecoderStream()).getReader();

  try {
    while (results.length < count) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.trim()) {
          results.push(JSON.parse(line));
        }
      }
    }
  } finally {
    await reader.cancel();
  }

  return results;
}

Deno.test("Proves GET /events/:topic streams existing entries as NDJSON", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "logs" }]);
  const controller = new AbortController();

  try {
    for (let idx = 0; idx < 3; idx++) {
      await (await fetch("/events/logs", jsonPost({ payload: { idx } }))).json();
    }

    const res = await fetch("/events/logs?start=1", {
      headers: { "Accept": "application/x-ndjson" },
      signal: controller.signal,
    });

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (res.headers.get("Content-Type") !== "application/x-ndjson") {
      throw new Error(`Expected application/x-ndjson content-type, got ${res.headers.get("Content-Type")}`);
    }

    const entries = await readNdjsonLines(res.body!, 3) as Array<{ id: number }>;

    if (entries.length !== 3) throw new Error(`Expected 3 entries, got ${entries.length}`);
    const ids = entries.map(entry => entry.id);
    if (ids.join(",") !== "1,2,3") throw new Error(`Expected ids 1,2,3, got ${ids.join(",")}`);
  } finally {
    controller.abort();
    await cleanup();
  }
});

Deno.test("Proves GET /events/:topic streams new entries written after the connection opens", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "logs" }]);
  const controller = new AbortController();

  try {
    const res = await fetch("/events/logs?start=1", {
      headers: { "Accept": "application/x-ndjson" },
      signal: controller.signal,
    });

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);

    // Write an entry after the stream is open
    await (await fetch("/events/logs", jsonPost({ payload: { live: true } }))).json();

    const entries = await readNdjsonLines(res.body!, 1) as Array<{ id: number; payload: { live: boolean } }>;

    if (entries.length !== 1) throw new Error(`Expected 1 entry, got ${entries.length}`);
    if (entries[0].payload.live !== true) throw new Error(`Expected live=true, got ${JSON.stringify(entries[0].payload)}`);
  } finally {
    controller.abort();
    await cleanup();
  }
});
