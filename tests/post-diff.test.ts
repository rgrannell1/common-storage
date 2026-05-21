// Integration tests for POST /diff/:topic — event and object set reconciliation
// @work.md

import { makePersistentServer, jsonPost, jsonPut, discard } from "./helpers.ts";
import { hashEventBucket, hashBucketRoot, hashUpdatedAt } from "../src/api/storage/kv/hashing.ts";

// SHA-256 of an empty input — used as the root hash when no entries exist
const EMPTY_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

type DiffResponse = { ranges?: { start: number; end: number }[]; ids?: string[] };
type EventEntry = { id: number; createdAt: number; updatedAt: number; payload: unknown };
type ObjectEntry = { id: string; createdAt: number; updatedAt: number; payload: unknown };

function post(fetch: (url: string, init?: RequestInit) => Promise<Response>, url: string, body: unknown): Promise<Response> {
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

Deno.test("Proves POST /diff/:topic returns 204 when event bucket hashes match exactly", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "logs" }]);
  try {
    const entry = await (await fetch("/events/logs", jsonPost({ payload: {} }))).json() as EventEntry;

    const bucketHash = await hashEventBucket([{ id: entry.id, updatedAt: entry.updatedAt }]);
    const root = await hashBucketRoot([bucketHash]);

    const res = await post(fetch, "/diff/logs", {
      bucketSize: 500,
      root,
      buckets: [{ start: 0, end: 500, hash: bucketHash }],
    });
    await discard(res);
    if (res.status !== 204) throw new Error(`Expected 204, got ${res.status}`);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves POST /diff/:topic returns only the differing range among multiple event buckets", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "logs" }]);
  try {
    const entry1 = await (await fetch("/events/logs", jsonPost({ payload: {} }))).json() as EventEntry;
    const _entry2 = await (await fetch("/events/logs", jsonPost({ payload: {} }))).json() as EventEntry;

    // Correct hash for the first bucket, wrong for the second
    const hash0 = await hashEventBucket([{ id: entry1.id, updatedAt: entry1.updatedAt }]);

    const res = await post(fetch, "/diff/logs", {
      bucketSize: 1,
      root: "a".repeat(64),
      buckets: [
        { start: 0, end: 1, hash: hash0 },
        { start: 1, end: 2, hash: "b".repeat(64) },
      ],
    });

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = await res.json() as DiffResponse;
    if (!body.ranges || body.ranges.length !== 1) throw new Error(`Expected 1 differing range, got ${JSON.stringify(body.ranges)}`);
    if (body.ranges[0].start !== 1 || body.ranges[0].end !== 2) {
      throw new Error(`Expected range {1, 2}, got ${JSON.stringify(body.ranges[0])}`);
    }
  } finally {
    await cleanup();
  }
});

Deno.test("Proves POST /diff/:topic returns 422 for a malformed event diff body", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "logs" }]);
  try {
    const res = await post(fetch, "/diff/logs", { notAValidField: true });
    await discard(res);
    if (res.status !== 422) throw new Error(`Expected 422, got ${res.status}`);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves POST /diff/:topic returns 204 when object entry hash matches exactly", async () => {
  const { fetch, cleanup } = await makePersistentServer([], [{ name: "items" }]);
  try {
    const entry = await (await fetch("/objects/items/abc", jsonPut({ payload: { value: 1 } }))).json() as ObjectEntry;

    const entryHash = await hashUpdatedAt(entry.updatedAt);

    const res = await post(fetch, "/diff/items", {
      entries: [{ id: "abc", hash: entryHash }],
    });
    await discard(res);
    if (res.status !== 204) throw new Error(`Expected 204, got ${res.status}`);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves POST /diff/:topic returns only differing ids among multiple objects", async () => {
  const { fetch, cleanup } = await makePersistentServer([], [{ name: "items" }]);
  try {
    const entryA = await (await fetch("/objects/items/a", jsonPut({ payload: 1 }))).json() as ObjectEntry;
    await discard(await fetch("/objects/items/b", jsonPut({ payload: 2 })));

    const hashA = await hashUpdatedAt(entryA.updatedAt);

    // Correct hash for "a", wrong for "b"
    const res = await post(fetch, "/diff/items", {
      entries: [
        { id: "a", hash: hashA },
        { id: "b", hash: "a".repeat(64) },
      ],
    });

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = await res.json() as DiffResponse;
    if (body.ids?.includes("a")) throw new Error(`"a" should not be in diff, got ${JSON.stringify(body.ids)}`);
    if (!body.ids?.includes("b")) throw new Error(`"b" should be in diff, got ${JSON.stringify(body.ids)}`);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves POST /diff/:topic includes tombstoned entries in object diff", async () => {
  const { fetch, cleanup } = await makePersistentServer([], [{ name: "items" }]);
  try {
    await discard(await fetch("/objects/items/gone", jsonPut({ payload: {} })));
    const tombstone = await (await fetch("/objects/items/gone", { method: "DELETE" })).json() as ObjectEntry;

    const tombstoneHash = await hashUpdatedAt(tombstone.updatedAt);

    // Correct tombstone hash — no diff
    const matchRes = await post(fetch, "/diff/items", { entries: [{ id: "gone", hash: tombstoneHash }] });
    await discard(matchRes);
    if (matchRes.status !== 204) throw new Error(`Expected 204 with correct tombstone hash, got ${matchRes.status}`);

    // Wrong hash — tombstone reported as differing
    const mismatchRes = await post(fetch, "/diff/items", { entries: [{ id: "gone", hash: "a".repeat(64) }] });
    const body = await mismatchRes.json() as DiffResponse;
    if (mismatchRes.status !== 200) throw new Error(`Expected 200 with wrong tombstone hash, got ${mismatchRes.status}`);
    if (!body.ids?.includes("gone")) throw new Error(`Expected "gone" in ids, got ${JSON.stringify(body.ids)}`);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves POST /diff/:topic returns 422 for a malformed object diff body", async () => {
  const { fetch, cleanup } = await makePersistentServer([], [{ name: "items" }]);
  try {
    const res = await post(fetch, "/diff/items", { notAValidField: true });
    await discard(res);
    if (res.status !== 422) throw new Error(`Expected 422, got ${res.status}`);
  } finally {
    await cleanup();
  }
});
