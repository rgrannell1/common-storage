// Integration tests for POST /diff/:topic — event and object set reconciliation
// @work.md

import { makePersistentServer, jsonPost, jsonPut } from "./helpers.ts";

// SHA-256 of an empty input — used as the root hash when no entries exist
const EMPTY_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

type DiffResponse = { ranges?: { start: number; end: number }[]; ids?: string[] };

async function post(fetch: (url: string, init?: RequestInit) => Promise<Response>, url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

Deno.test("Proves POST /diff/:topic returns 404 for an unknown topic", async () => {
  const { fetch, cleanup } = await makePersistentServer();
  try {
    const res = await post(fetch, "/diff/nonexistent", { bucketSize: 500, root: EMPTY_HASH, buckets: [] });
    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
    await res.body?.cancel();
  } finally {
    await cleanup();
  }
});

Deno.test("Proves POST /diff/:topic returns 204 when event topic state matches", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "logs" }]);
  try {
    // Empty topic — root hash is SHA-256 of no bucket hashes (empty concatenation)
    const res = await post(fetch, "/diff/logs", { bucketSize: 500, root: EMPTY_HASH, buckets: [] });
    if (res.status !== 204) throw new Error(`Expected 204, got ${res.status}`);
    await res.body?.cancel();
  } finally {
    await cleanup();
  }
});

Deno.test("Proves POST /diff/:topic returns differing ranges when event hashes diverge", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "logs" }]);
  try {
    await (await fetch("/events/logs", jsonPost({ payload: {} }))).json();

    // Send a deliberately wrong root/bucket hash — server will report the range as differing
    const res = await post(fetch, "/diff/logs", {
      bucketSize: 500,
      root: "a".repeat(64),
      buckets: [{ start: 0, end: 500, hash: "b".repeat(64) }],
    });

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = await res.json() as DiffResponse;
    if (!body.ranges || body.ranges.length !== 1) throw new Error(`Expected 1 differing range, got ${JSON.stringify(body.ranges)}`);
    if (body.ranges[0].start !== 0 || body.ranges[0].end !== 500) {
      throw new Error(`Expected range {0, 500}, got ${JSON.stringify(body.ranges[0])}`);
    }
  } finally {
    await cleanup();
  }
});

Deno.test("Proves POST /diff/:topic returns 204 when object topic state matches", async () => {
  const { fetch, cleanup } = await makePersistentServer([], [{ name: "items" }]);
  try {
    // Empty topic — client sends no entries, server has none
    const res = await post(fetch, "/diff/items", { entries: [] });
    if (res.status !== 204) throw new Error(`Expected 204, got ${res.status}`);
    await res.body?.cancel();
  } finally {
    await cleanup();
  }
});

Deno.test("Proves POST /diff/:topic returns differing ids when object hashes diverge", async () => {
  const { fetch, cleanup } = await makePersistentServer([], [{ name: "items" }]);
  try {
    await (await fetch("/objects/items/abc", jsonPut({ payload: { value: 1 } }))).json();

    // Client sends wrong hash for "abc" — server reports it as differing
    const res = await post(fetch, "/diff/items", {
      entries: [{ id: "abc", hash: "a".repeat(64) }],
    });

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = await res.json() as DiffResponse;
    if (!body.ids || !body.ids.includes("abc")) throw new Error(`Expected ids to include "abc", got ${JSON.stringify(body.ids)}`);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves POST /diff/:topic returns server-only ids when client omits them", async () => {
  const { fetch, cleanup } = await makePersistentServer([], [{ name: "items" }]);
  try {
    await (await fetch("/objects/items/xyz", jsonPut({ payload: { value: 1 } }))).json();

    // Client sends no entries — server has "xyz", reports it as differing
    const res = await post(fetch, "/diff/items", { entries: [] });

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = await res.json() as DiffResponse;
    if (!body.ids || !body.ids.includes("xyz")) throw new Error(`Expected ids to include "xyz", got ${JSON.stringify(body.ids)}`);
  } finally {
    await cleanup();
  }
});
