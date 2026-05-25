// Integration tests for POST /diff/:topic — event and object set reconciliation
// @work.md

import { makePersistentServer, jsonPost, jsonPut, discard } from "./helpers.ts";
import { hashBucket, hashBucketRoot, bucketStartFor } from "../src/core/hashing.ts";

// SHA-256 of an empty input — used as the root hash when no entries exist
const EMPTY_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

// Mirror the server's fixed bucket sizes — clients must match these
const EVENT_BUCKET_SIZE = 500;
const OBJECT_BUCKET_SIZE = 50;

type DiffResponse = { ranges?: { start: number; end: number }[] };
type EventEntry = { id: number; createdAt: number; updatedAt: number; payload: unknown };
type ObjectEntry = { id: string; seq: number; createdAt: number; updatedAt: number; payload: unknown };

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
    const res = await post(fetch, "/diff/nonexistent", { root: EMPTY_HASH, buckets: [] });
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
    const res = await post(fetch, "/diff/logs", { root: EMPTY_HASH, buckets: [] });
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
      root: "a".repeat(64),
      buckets: [{ start: 0, end: EVENT_BUCKET_SIZE, hash: "b".repeat(64) }],
    });

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = await res.json() as DiffResponse;
    if (!body.ranges || body.ranges.length !== 1) throw new Error(`Expected 1 differing range, got ${JSON.stringify(body.ranges)}`);
    if (body.ranges[0].start !== 0 || body.ranges[0].end !== EVENT_BUCKET_SIZE) {
      throw new Error(`Expected range {0, ${EVENT_BUCKET_SIZE}}, got ${JSON.stringify(body.ranges[0])}`);
    }
  } finally {
    await cleanup();
  }
});

Deno.test("Proves POST /diff/:topic returns 204 when object topic state matches", async () => {
  const { fetch, cleanup } = await makePersistentServer([], [{ name: "items" }]);
  try {
    // Empty topic — root hash over zero buckets matches empty server state
    const res = await post(fetch, "/diff/items", { root: EMPTY_HASH, buckets: [] });
    if (res.status !== 204) throw new Error(`Expected 204, got ${res.status}`);
    await res.body?.cancel();
  } finally {
    await cleanup();
  }
});

Deno.test("Proves POST /diff/:topic returns differing ranges when object hashes diverge", async () => {
  const { fetch, cleanup } = await makePersistentServer([], [{ name: "items" }]);
  try {
    const entry = await (await fetch("/objects/items/abc", jsonPut({ payload: { value: 1 } }))).json() as ObjectEntry;
    const bucketStart = bucketStartFor(entry.seq, OBJECT_BUCKET_SIZE);

    // Client sends wrong hash for the bucket containing "abc" — server reports it as differing
    const res = await post(fetch, "/diff/items", {
      root: "a".repeat(64),
      buckets: [{ start: bucketStart, end: bucketStart + OBJECT_BUCKET_SIZE, hash: "b".repeat(64) }],
    });

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = await res.json() as DiffResponse;
    if (!body.ranges || body.ranges.length < 1) throw new Error(`Expected at least 1 differing range, got ${JSON.stringify(body.ranges)}`);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves POST /diff/:topic returns server-only ranges when object client omits them", async () => {
  const { fetch, cleanup } = await makePersistentServer([], [{ name: "items" }]);
  try {
    const entry = await (await fetch("/objects/items/xyz", jsonPut({ payload: { value: 1 } }))).json() as ObjectEntry;

    // Client claims it is in sync over zero buckets but server has "xyz" — server reports the bucket as differing
    const root = await hashBucketRoot([]);
    const res = await post(fetch, "/diff/items", { root, buckets: [] });

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = await res.json() as DiffResponse;
    const expectedStart = bucketStartFor(entry.seq, OBJECT_BUCKET_SIZE);
    if (!body.ranges || !body.ranges.some(range => range.start === expectedStart)) {
      throw new Error(`Expected a range starting at ${expectedStart}, got ${JSON.stringify(body.ranges)}`);
    }
  } finally {
    await cleanup();
  }
});

Deno.test("Proves POST /diff/:topic returns 204 when event bucket hashes match exactly", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "logs" }]);
  try {
    const entry = await (await fetch("/events/logs", jsonPost({ payload: {} }))).json() as EventEntry;

    const bucketHash = await hashBucket([{ id: entry.id, updatedAt: entry.updatedAt }]);
    const root = await hashBucketRoot([bucketHash]);

    const res = await post(fetch, "/diff/logs", {
      root,
      buckets: [{ start: 0, end: EVENT_BUCKET_SIZE, hash: bucketHash }],
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
    // PUT at specific IDs to place entries in two different 500-wide buckets
    const entry1 = await (await fetch("/events/logs/1", jsonPut({ payload: {} }))).json() as EventEntry;
    await discard(await fetch(`/events/logs/${EVENT_BUCKET_SIZE + 1}`, jsonPut({ payload: {} })));

    // Correct hash for bucket [0, 500) containing entry1 only; wrong hash for [500, 1000)
    const hash0 = await hashBucket([{ id: entry1.id, updatedAt: entry1.updatedAt }]);

    const res = await post(fetch, "/diff/logs", {
      root: "a".repeat(64),
      buckets: [
        { start: 0, end: EVENT_BUCKET_SIZE, hash: hash0 },
        { start: EVENT_BUCKET_SIZE, end: EVENT_BUCKET_SIZE * 2, hash: "b".repeat(64) },
      ],
    });

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = await res.json() as DiffResponse;
    if (!body.ranges || body.ranges.length !== 1) throw new Error(`Expected 1 differing range, got ${JSON.stringify(body.ranges)}`);
    if (body.ranges[0].start !== EVENT_BUCKET_SIZE || body.ranges[0].end !== EVENT_BUCKET_SIZE * 2) {
      throw new Error(`Expected range {${EVENT_BUCKET_SIZE}, ${EVENT_BUCKET_SIZE * 2}}, got ${JSON.stringify(body.ranges[0])}`);
    }
  } finally {
    await cleanup();
  }
});

Deno.test("Proves POST /diff/:topic returns server-only ranges when client sends no buckets covering them", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "logs" }]);
  try {
    const entry = await (await fetch("/events/logs", jsonPost({ payload: {} }))).json() as EventEntry;

    // Client claims it is in sync (matching root over zero buckets) but has never seen any events
    const root = await hashBucketRoot([]);
    const res = await post(fetch, "/diff/logs", { root, buckets: [] });

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = await res.json() as DiffResponse;
    if (!body.ranges || body.ranges.length !== 1) throw new Error(`Expected 1 range, got ${JSON.stringify(body.ranges)}`);
    const bucketStart = bucketStartFor(entry.id, EVENT_BUCKET_SIZE);
    if (body.ranges[0].start !== bucketStart) throw new Error(`Expected start ${bucketStart}, got ${body.ranges[0].start}`);
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

Deno.test("Proves POST /diff/:topic returns 204 when object bucket hash matches exactly", async () => {
  const { fetch, cleanup } = await makePersistentServer([], [{ name: "items" }]);
  try {
    const entry = await (await fetch("/objects/items/abc", jsonPut({ payload: { value: 1 } }))).json() as ObjectEntry;

    const bucketStart = bucketStartFor(entry.seq, OBJECT_BUCKET_SIZE);
    const bucketHash = await hashBucket([{ id: entry.seq, updatedAt: entry.updatedAt }]);
    const root = await hashBucketRoot([bucketHash]);

    const res = await post(fetch, "/diff/items", {
      root,
      buckets: [{ start: bucketStart, end: bucketStart + OBJECT_BUCKET_SIZE, hash: bucketHash }],
    });
    await discard(res);
    if (res.status !== 204) throw new Error(`Expected 204, got ${res.status}`);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves POST /diff/:topic returns only the differing range among multiple object buckets", async () => {
  const { fetch, cleanup } = await makePersistentServer([], [{ name: "items" }]);
  try {
    const entry = await (await fetch("/objects/items/a", jsonPut({ payload: 1 }))).json() as ObjectEntry;

    const bucketStart = bucketStartFor(entry.seq, OBJECT_BUCKET_SIZE);
    const hashA = await hashBucket([{ id: entry.seq, updatedAt: entry.updatedAt }]);

    // Send correct hash for "a"'s bucket and the correct empty hash for the adjacent bucket (no entries there).
    // Both should match — 204.
    const root204 = await hashBucketRoot([hashA, EMPTY_HASH]);
    const matchRes = await post(fetch, "/diff/items", {
      root: root204,
      buckets: [
        { start: bucketStart, end: bucketStart + OBJECT_BUCKET_SIZE, hash: hashA },
        { start: bucketStart + OBJECT_BUCKET_SIZE, end: bucketStart + OBJECT_BUCKET_SIZE * 2, hash: EMPTY_HASH },
      ],
    });
    await discard(matchRes);
    if (matchRes.status !== 204) throw new Error(`Expected 204 with correct hashes, got ${matchRes.status}`);

    // Send correct hash for "a"'s bucket but wrong for the adjacent — only that bucket should differ.
    const mismatchRes = await post(fetch, "/diff/items", {
      root: "a".repeat(64),
      buckets: [
        { start: bucketStart, end: bucketStart + OBJECT_BUCKET_SIZE, hash: hashA },
        { start: bucketStart + OBJECT_BUCKET_SIZE, end: bucketStart + OBJECT_BUCKET_SIZE * 2, hash: "b".repeat(64) },
      ],
    });

    if (mismatchRes.status !== 200) throw new Error(`Expected 200, got ${mismatchRes.status}`);
    const body = await mismatchRes.json() as DiffResponse;
    const ranges = body.ranges ?? [];
    if (ranges.some(range => range.start === bucketStart)) throw new Error(`"a"'s bucket should not differ, got ${JSON.stringify(ranges)}`);
    if (!ranges.some(range => range.start === bucketStart + OBJECT_BUCKET_SIZE)) {
      throw new Error(`Adjacent bucket should differ, got ${JSON.stringify(ranges)}`);
    }
  } finally {
    await cleanup();
  }
});

Deno.test("Proves POST /diff/:topic includes tombstoned entries in object diff", async () => {
  const { fetch, cleanup } = await makePersistentServer([], [{ name: "items" }]);
  try {
    await discard(await fetch("/objects/items/gone", jsonPut({ payload: {} })));
    const tombstone = await (await fetch("/objects/items/gone", { method: "DELETE" })).json() as ObjectEntry;

    // Tombstone has its own seq (assigned on delete); hash its bucket like any other entry
    const bucketStart = bucketStartFor(tombstone.seq, OBJECT_BUCKET_SIZE);
    const tombstoneHash = await hashBucket([{ id: tombstone.seq, updatedAt: tombstone.updatedAt }]);
    const root = await hashBucketRoot([tombstoneHash]);

    // Correct tombstone bucket hash — no diff
    const matchRes = await post(fetch, "/diff/items", {
      root,
      buckets: [{ start: bucketStart, end: bucketStart + OBJECT_BUCKET_SIZE, hash: tombstoneHash }],
    });
    await discard(matchRes);
    if (matchRes.status !== 204) throw new Error(`Expected 204 with correct tombstone hash, got ${matchRes.status}`);

    // Wrong hash — tombstone bucket reported as differing
    const mismatchRes = await post(fetch, "/diff/items", {
      root: "a".repeat(64),
      buckets: [{ start: bucketStart, end: bucketStart + OBJECT_BUCKET_SIZE, hash: "b".repeat(64) }],
    });
    const body = await mismatchRes.json() as DiffResponse;
    if (mismatchRes.status !== 200) throw new Error(`Expected 200 with wrong tombstone hash, got ${mismatchRes.status}`);
    if (!body.ranges?.some(range => range.start === bucketStart)) {
      throw new Error(`Expected tombstone bucket [${bucketStart}, ${bucketStart + OBJECT_BUCKET_SIZE}) in ranges, got ${JSON.stringify(body.ranges)}`);
    }
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
