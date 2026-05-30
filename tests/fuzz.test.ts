// fuzz.test.ts — property-based fuzz tests proving no route crashes or 5xxs on arbitrary input
// @work.md

import { makePersistentServer, makeUnauthContext, discard, TEST_TOKEN } from "./helpers.ts";
import * as Peach from "peach";

// Number of random bodies sent per route per test
const FUZZ_ITERATIONS = 50;

// Density function driving all fuzzer choices
const density = Peach.Number.uniform;

// -- String generators --

const arbitraryCharGen = Peach.Logic.oneOf(density, [
  Peach.String.unicode(density),
  Peach.String.letters(density),
  () => "\x00",
  () => "\n",
  () => "\r",
  () => "\"",
  () => "\\",
  () => "{",
  () => "}",
  () => "[",
  () => "]",
  () => ",",
  () => ":",
  () => "%",
  () => "null",
  () => "undefined",
]);

const arbitraryStringGen = Peach.String.from(arbitraryCharGen, density(0, 200));

// -- JSON value generators --

// Forward-declare so JSON_GENERATORS can reference these before they're textually defined
function arbitraryJsonValue(): unknown {
  const idx = density(0, JSON_GENERATORS.length)();
  return JSON_GENERATORS[idx]();
}

function buildArbitraryObject(): Record<string, unknown> {
  return Peach.Object.from(arbitraryStringGen, arbitraryJsonValue, density(0, 8))();
}

const JSON_GENERATORS: Array<() => unknown> = [
  () => null,
  () => density(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)(),
  () => density(0, 2)() === 0,
  () => arbitraryStringGen(),
  () => Peach.Array.from(arbitraryJsonValue, density(0, 8))(),
  () => buildArbitraryObject(),
  () => Infinity,
  () => NaN,
  () => -Infinity,
  () => density(0, 2)() === 0 ? Number.MAX_SAFE_INTEGER : Number.MIN_SAFE_INTEGER,
];

// -- Body generators --

function correctShapeBody(): string {
  return JSON.stringify({ payload: arbitraryJsonValue() });
}

function wrongShapeBody(): string {
  try {
    return JSON.stringify(buildArbitraryObject());
  } catch {
    return "{}";
  }
}

function primitiveBody(): string {
  try {
    return JSON.stringify(JSON_GENERATORS[density(0, 6)()]()) ?? "";
  } catch {
    return "";
  }
}

function hugeBody(): string {
  return JSON.stringify({ payload: "x".repeat(100_000) });
}

function deeplyNestedBody(): string {
  let val: unknown = { value: 1 };
  for (let depth = 0; depth < 50; depth++) {
    val = { nested: val };
  }
  return JSON.stringify({ payload: val });
}

const BODY_GENERATORS: Array<() => string> = [
  correctShapeBody,
  wrongShapeBody,
  primitiveBody,
  () => arbitraryStringGen(),
  () => "",
  () => "null",
  () => "undefined",
  () => "<xml/>",
  hugeBody,
  deeplyNestedBody,
  () => "\x00\x01\x02\x03",
  () => '{"payload":',
  () => "true",
  () => "[]",
];

function arbitraryBody(): string {
  const idx = density(0, BODY_GENERATORS.length)();
  return BODY_GENERATORS[idx]();
}

// -- Content-type generators --

const CONTENT_TYPES: Array<string | undefined> = [
  "application/json",
  "text/plain",
  "application/x-www-form-urlencoded",
  "application/octet-stream",
  undefined,
  "",
  "application/json; charset=utf-8",
  "text/html",
];

function arbitraryContentType(): string | undefined {
  return CONTENT_TYPES[density(0, CONTENT_TYPES.length)()];
}

// -- Request builders --

function buildFuzzInit(method: string): RequestInit {
  const contentType = arbitraryContentType();
  const headers: Record<string, string> = {};
  if (contentType !== undefined) {
    headers["Content-Type"] = contentType;
  }

  return {
    method,
    headers,
    body: method !== "GET" && method !== "HEAD" ? arbitraryBody() : undefined,
  };
}

// -- Assertion --

async function assertNoCrash(res: Response, label: string): Promise<void> {
  const status = res.status;
  await discard(res);
  if (status >= 500) {
    throw new Error(`${label}: server returned ${status}`);
  }
}

// JSON write headers carrying an idempotency key, shared across the idempotency fuzz cases.
function idempotencyHeaders(key: string): Record<string, string> {
  return { "Content-Type": "application/json", "Idempotency-Key": key };
}

// -- Fuzz inputs for path segments --

// Topic names covering empty, overlong, special chars, path traversal, unicode
const FUZZ_TOPIC_NAMES = [
  "events",
  "",
  "a".repeat(200),
  "../etc/passwd",
  "topic/slash",
  "🎉topic",
  "  spaces  ",
  "0",
  "null",
  "\x00null",
  "topic%00",
];

// IDs covering edge cases for event and object topics
const FUZZ_IDS = [
  "1",
  "0",
  "-1",
  "abc",
  "",
  "9".repeat(20),
  "../",
  "🎉",
  "\x00",
  "null",
  "1.5",
];

// Arbitrary Authorization header values to fuzz the auth middleware
// Returns true if the value can be transmitted as an HTTP header via the fetch API.
// Values containing null bytes or other non-ByteString characters are rejected client-side.
function isSendableHeaderValue(value: string): boolean {
  try {
    new Headers({ "Authorization": value });
    return true;
  } catch {
    return false;
  }
}

const FUZZ_AUTH_HEADERS = [
  "",
  "Bearer",
  "Bearer ",
  `Bearer ${arbitraryStringGen()}`,
  "Basic dXNlcjpwYXNz",
  "Digest realm=test",
  arbitraryStringGen(),
  "\x00\x01",
  `Bearer ${"A".repeat(10_000)}`,
  `Bearer ${TEST_TOKEN}`,
].filter(isSendableHeaderValue);

// Query parameter values probing parser edge cases
const FUZZ_QUERY_VALUES = [
  "",
  "null",
  "undefined",
  "0",
  "-1",
  "a".repeat(500),
  "';DROP TABLE events;--",
  "🎉",
  arbitraryStringGen(),
  "identity()",
  `[?payload.value == \`${arbitraryStringGen()}\`]`,
];

// -- Tests --

Deno.test("Proves POST /events/:topic never crashes on arbitrary bodies", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "events" }]);
  try {
    for (let idx = 0; idx < FUZZ_ITERATIONS; idx++) {
      const res = await fetch("/events/events", buildFuzzInit("POST"));
      await assertNoCrash(res, `POST /events/events iter=${idx}`);
    }
  } finally {
    await cleanup();
  }
});

Deno.test("Proves PUT /events/:topic/:id never crashes on arbitrary bodies", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "events" }]);
  try {
    for (let idx = 0; idx < FUZZ_ITERATIONS; idx++) {
      const id = density(1, 1000)();
      const res = await fetch(`/events/events/${id}`, buildFuzzInit("PUT"));
      await assertNoCrash(res, `PUT /events/events/${id} iter=${idx}`);
    }
  } finally {
    await cleanup();
  }
});

Deno.test("Proves PUT /objects/:topic/:id never crashes on arbitrary bodies", async () => {
  const { fetch, cleanup } = await makePersistentServer([], [{ name: "objects" }]);
  try {
    for (let idx = 0; idx < FUZZ_ITERATIONS; idx++) {
      const rawId = arbitraryStringGen() || "fallback-id";
      let encodedId: string;
      try {
        encodedId = encodeURIComponent(rawId);
      } catch {
        encodedId = "fallback-id";
      }
      const res = await fetch(`/objects/objects/${encodedId}`, buildFuzzInit("PUT"));
      await assertNoCrash(res, `PUT /objects/objects/${rawId} iter=${idx}`);
    }
  } finally {
    await cleanup();
  }
});

Deno.test("Proves POST /diff/:topic never crashes on arbitrary bodies for both types", async () => {
  const eventCfg = [{ name: "events" }];
  const objectCfg = [{ name: "objects" }];
  const { fetch, cleanup } = await makePersistentServer(eventCfg, objectCfg);
  try {
    for (let idx = 0; idx < FUZZ_ITERATIONS; idx++) {
      const topicChoice = density(0, 2)();
      const topic = topicChoice === 0 ? "events" : "objects";
      const res = await fetch(`/diff/${topic}`, buildFuzzInit("POST"));
      await assertNoCrash(res, `POST /diff/${topic} iter=${idx}`);
    }
  } finally {
    await cleanup();
  }
});

Deno.test("Proves all routes never crash when given arbitrary topic names", async () => {
  const eventCfg = [{ name: "events" }];
  const objectCfg = [{ name: "objects" }];
  const { fetch, cleanup } = await makePersistentServer(eventCfg, objectCfg);
  try {
    for (const topic of FUZZ_TOPIC_NAMES) {
      const encoded = encodeURIComponent(topic);
      const eventsPath = `/events/${encoded}`;
      const eventPath = `/events/${encoded}/1`;
      const objectsPath = `/objects/${encoded}`;
      const objectPath = `/objects/${encoded}/someId`;
      const diffPath = `/diff/${encoded}`;

      const postEventRes = await fetch(eventsPath, buildFuzzInit("POST"));
      await assertNoCrash(postEventRes, `POST /events/${topic}`);

      const putEventRes = await fetch(eventPath, buildFuzzInit("PUT"));
      await assertNoCrash(putEventRes, `PUT /events/${topic}/1`);

      const putObjectRes = await fetch(objectPath, buildFuzzInit("PUT"));
      await assertNoCrash(putObjectRes, `PUT /objects/${topic}/someId`);

      const diffRes = await fetch(diffPath, buildFuzzInit("POST"));
      await assertNoCrash(diffRes, `POST /diff/${topic}`);

      const getEventsRes = await fetch(eventsPath);
      await assertNoCrash(getEventsRes, `GET /events/${topic}`);

      const getEventRes = await fetch(eventPath);
      await assertNoCrash(getEventRes, `GET /events/${topic}/1`);

      const getObjectsRes = await fetch(objectsPath);
      await assertNoCrash(getObjectsRes, `GET /objects/${topic}`);

      const getObjectRes = await fetch(objectPath);
      await assertNoCrash(getObjectRes, `GET /objects/${topic}/someId`);

      const deleteObjectRes = await fetch(objectPath, { method: "DELETE" });
      await assertNoCrash(deleteObjectRes, `DELETE /objects/${topic}/someId`);
    }
  } finally {
    await cleanup();
  }
});

Deno.test("Proves GET routes never crash on arbitrary query parameter values", async () => {
  const eventCfg = [{ name: "events" }];
  const objectCfg = [{ name: "objects" }];
  const { fetch, cleanup } = await makePersistentServer(eventCfg, objectCfg);
  try {
    for (const rawVal of FUZZ_QUERY_VALUES) {
      let encoded: string;
      try {
        encoded = encodeURIComponent(rawVal);
      } catch {
        // lone surrogates from the unicode generator cannot be percent-encoded — skip
        continue;
      }

      const feedUrl = `/feed?human=${encoded}`;
      const feedRes = await fetch(feedUrl);
      await assertNoCrash(feedRes, `GET /feed?human=${rawVal}`);

      const eventsFilterUrl = `/events/events?filter=${encoded}`;
      const eventsFilterRes = await fetch(eventsFilterUrl);
      await assertNoCrash(eventsFilterRes, `GET /events/events?filter=${rawVal}`);

      const eventsPagUrl = `/events/events?start=${encoded}&size=${encoded}`;
      const eventsPagRes = await fetch(eventsPagUrl);
      await assertNoCrash(eventsPagRes, `GET /events/events?start=${rawVal}&size=${rawVal}`);

      const eventsIdsUrl = `/events/events?ids=${encoded}`;
      const eventsIdsRes = await fetch(eventsIdsUrl);
      await assertNoCrash(eventsIdsRes, `GET /events/events?ids=${rawVal}`);

      const objectsFilterUrl = `/objects/objects?filter=${encoded}`;
      const objectsFilterRes = await fetch(objectsFilterUrl);
      await assertNoCrash(objectsFilterRes, `GET /objects/objects?filter=${rawVal}`);

      const objectsPagUrl = `/objects/objects?start=${encoded}&size=${encoded}`;
      const objectsPagRes = await fetch(objectsPagUrl);
      await assertNoCrash(objectsPagRes, `GET /objects/objects?start=${rawVal}&size=${rawVal}`);
    }
  } finally {
    await cleanup();
  }
});

Deno.test("Proves DELETE /objects/:topic/:id never crashes on arbitrary IDs", async () => {
  const { fetch, cleanup } = await makePersistentServer([], [{ name: "objects" }]);
  try {
    for (const rawId of FUZZ_IDS) {
      const encoded = encodeURIComponent(rawId);
      const res = await fetch(`/objects/objects/${encoded}`, { method: "DELETE" });
      await assertNoCrash(res, `DELETE /objects/objects/${rawId}`);
    }
  } finally {
    await cleanup();
  }
});

// Idempotency key values covering length edge cases — the key is stored as a Deno KV key part,
// which has a 2KB per-element limit. Exceeding it should return an error, not crash.
const FUZZ_IDEMPOTENCY_KEYS = [
  "normal-key",
  "",
  "k".repeat(2048),
  "k".repeat(4096),
  "k".repeat(65536),
  arbitraryStringGen(),
  "key with spaces",
  "key\twith\ttabs",
  "key/with/slashes",
  JSON.stringify({ nested: "object" }),
];

Deno.test("Proves write routes never crash on extreme Idempotency-Key values", async () => {
  const eventCfg = [{ name: "events" }];
  const objectCfg = [{ name: "objects" }];
  const { fetch, cleanup } = await makePersistentServer(eventCfg, objectCfg);
  try {
    for (const idempotencyKey of FUZZ_IDEMPOTENCY_KEYS) {
      // Use per-operation suffixes so each route gets an independent cache namespace —
      // sharing a key across POST and PUT is a separate server bug tested below.
      const postKey = `${idempotencyKey}-post`;
      const putEventKey = `${idempotencyKey}-put-event`;
      const putObjectKey = `${idempotencyKey}-put-object`;

      // Skip keys that contain non-ByteString characters — the fetch API rejects these
      // client-side before they reach the server, so there is nothing server-side to test.
      if (!isSendableHeaderValue(postKey)) continue;

      const payload = JSON.stringify({ payload: {} });
      const postRes = await fetch("/events/events", {
        method: "POST",
        headers: idempotencyHeaders(postKey),
        body: payload,
      });
      const postKeyLen = postKey.length;
      await assertNoCrash(postRes, `POST /events with idem-key len=${postKeyLen}`);

      const putRes = await fetch("/events/events/1", {
        method: "PUT",
        headers: idempotencyHeaders(putEventKey),
        body: payload,
      });
      const putEventKeyLen = putEventKey.length;
      await assertNoCrash(putRes, `PUT /events/1 with idem-key len=${putEventKeyLen}`);

      const putObjectRes = await fetch("/objects/objects/test-id", {
        method: "PUT",
        headers: idempotencyHeaders(putObjectKey),
        body: payload,
      });
      const putObjectKeyLen = putObjectKey.length;
      await assertNoCrash(putObjectRes, `PUT /objects with idem-key len=${putObjectKeyLen}`);
    }
  } finally {
    await cleanup();
  }
});

// Regression test for cross-operation idempotency cache contamination:
// POST writes EventEntry to cache; PUT reads it expecting PutEventResult.
// .entry on EventEntry is undefined → parseResponse fails → 500.
Deno.test("Proves POST/PUT with same Idempotency-Key on same topic does not 500", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "events" }]);
  try {
    const sharedKey = "shared-idempotency-key";
    const payload = JSON.stringify({ payload: {} });

    const postRes = await fetch("/events/events", {
      method: "POST",
      headers: idempotencyHeaders(sharedKey),
      body: payload,
    });
    await assertNoCrash(postRes, "POST /events/events with shared idempotency key");

    const putRes = await fetch("/events/events/1", {
      method: "PUT",
      headers: idempotencyHeaders(sharedKey),
      body: payload,
    });
    const msg = "PUT /events/events/1 with same idem-key as prior POST";
    await assertNoCrash(putRes, msg);
  } finally {
    await cleanup();
  }
});

// ?ids= values covering empty lists, malformed entries, and large lists.
// Commas are not percent-encoded — they're valid unencoded in query strings and are the
// expected delimiter, so encoding them would triple the URL length unnecessarily.
// The parser splits on commas before the schema refine, exercising the unbounded split.
const FUZZ_IDS_PARAMS = [
  "",
  "1",
  "1,2,3",
  "1,",
  ",1",
  ",,,,",
  "1,abc,3",
  "1e10",
  Array.from({ length: 500 }, (_, idx) => idx + 1).join(","),
  Array.from({ length: 2000 }, (_, idx) => idx + 1).join(","),
  "2147483647",
  "9007199254740991",
  "-1,-2,-3",
  " 1 , 2 , 3 ",
];

Deno.test("Proves GET /events/:topic?ids= never crashes on pathological id lists", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "events" }]);
  try {
    for (const idsVal of FUZZ_IDS_PARAMS) {
      // Encode only characters that must be encoded in query strings; leave commas raw.
      const encoded = idsVal.replace(/[^a-zA-Z0-9,.\-_~: ]/g, (ch) => encodeURIComponent(ch));
      const res = await fetch(`/events/events?ids=${encoded}`);
      await assertNoCrash(res, `GET /events/events?ids= length=${idsVal.length}`);
    }
  } finally {
    await cleanup();
  }
});

// ?size= values covering the full int range and non-integer edge cases.
// QuerySizeSchema has no upper bound — a value of Number.MAX_SAFE_INTEGER passes Zod
// validation and is forwarded to the KV list limit.
const FUZZ_SIZE_PARAMS = [
  "0",
  "1",
  "100",
  "10000",
  "1000000",
  "2147483647",
  "9007199254740991",
  "-1",
  "1.5",
  "Infinity",
  "NaN",
  "",
  "1e5",
  "1e20",
  "9".repeat(30),
];

Deno.test("Proves GET /events/:topic?size= never crashes on extreme size values", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "events" }]);
  try {
    for (const sizeVal of FUZZ_SIZE_PARAMS) {
      const res = await fetch(`/events/events?size=${encodeURIComponent(sizeVal)}`);
      await assertNoCrash(res, `GET /events/events?size=${sizeVal}`);
    }
  } finally {
    await cleanup();
  }
});

// ?start= values — symmetric to FUZZ_SIZE_PARAMS; integer start offsets with edge cases
const FUZZ_START_PARAMS = [
  "0",
  "1",
  "-1",
  "9007199254740991",
  "-9007199254740991",
  "NaN",
  "Infinity",
  "-Infinity",
  "",
  "1.5",
  "1e5",
  "1e20",
  "9".repeat(30),
  "abc",
];

Deno.test("Proves GET /events/:topic?start= never crashes on extreme start values", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "events" }]);
  try {
    for (const startVal of FUZZ_START_PARAMS) {
      const res = await fetch(`/events/events?start=${encodeURIComponent(startVal)}`);
      await assertNoCrash(res, `GET /events/events?start=${startVal}`);
    }
  } finally {
    await cleanup();
  }
});

Deno.test("Proves GET /objects/:topic?size= never crashes on extreme size values", async () => {
  const { fetch, cleanup } = await makePersistentServer([], [{ name: "objects" }]);
  try {
    for (const sizeVal of FUZZ_SIZE_PARAMS) {
      const res = await fetch(`/objects/objects?size=${encodeURIComponent(sizeVal)}`);
      await assertNoCrash(res, `GET /objects/objects?size=${sizeVal}`);
    }
  } finally {
    await cleanup();
  }
});

Deno.test("Proves GET /objects/:topic?start= never crashes on extreme start values", async () => {
  const { fetch, cleanup } = await makePersistentServer([], [{ name: "objects" }]);
  try {
    for (const startVal of FUZZ_START_PARAMS) {
      const res = await fetch(`/objects/objects?start=${encodeURIComponent(startVal)}`);
      await assertNoCrash(res, `GET /objects/objects?start=${startVal}`);
    }
  } finally {
    await cleanup();
  }
});

// JMESPath-specific adversarial inputs — patterns that exercise the parser's error handling,
// deep recursion, and long expression paths rather than just schema validation.
const FUZZ_FILTER_PARAMS = [
  "payload",
  "payload.value",
  "*",
  "@",
  "**",
  "[*]",
  "[?@ == @]",
  "sort_by(@, &updatedAt)",
  "length(@)",
  "[?payload.value > `0`]",
  // Deeply recursive wildcard — exercises parser stack depth
  "[?a.[?b.[?c.[?d.[?e]]]]]",
  // Very long chained path — may cause linear scan or O(n) allocation
  "payload." + "nested.".repeat(100) + "value",
  "SELECT * FROM events; DROP TABLE--",
  arbitraryStringGen(),
  "a".repeat(1000),
];

Deno.test("Proves ?filter= param never crashes on adversarial JMESPath expressions", async () => {
  const eventCfg = [{ name: "events" }];
  const objectCfg = [{ name: "objects" }];
  const { fetch, cleanup } = await makePersistentServer(eventCfg, objectCfg);
  try {
    for (const filterVal of FUZZ_FILTER_PARAMS) {
      const encoded = encodeURIComponent(filterVal);
      const preview = filterVal.slice(0, 50);

      const eventsUrl = `/events/events?filter=${encoded}`;
      const eventsRes = await fetch(eventsUrl);
      await assertNoCrash(eventsRes, `GET /events/events?filter=${preview}`);

      const objectsUrl = `/objects/objects?filter=${encoded}`;
      const objectsRes = await fetch(objectsUrl);
      await assertNoCrash(objectsRes, `GET /objects/objects?filter=${preview}`);
    }
  } finally {
    await cleanup();
  }
});

// Valid-shape Merkle diff bodies with semantically wrong content — these pass the Zod schema check
// and reach business logic, where wrong hash lengths, non-hex chars, or huge arrays may crash.
const VALID_HEX_64 = "a".repeat(64);

const threeThousandNodes = Array.from(
  { length: 3000 },
  (_, idx) => ({ start: idx * 100, end: (idx + 1) * 100, hash: VALID_HEX_64 })
);

const STRUCTURED_DIFF_BODIES = [
  // Node hash too short (32 chars instead of 64)
  { nodes: [{ start: 0, end: 1000, hash: "a".repeat(32) }] },
  // Non-hex characters in node hash
  { nodes: [{ start: 0, end: 1000, hash: "z".repeat(64) }] },
  // 3000 nodes — exceeds 2000-node cap, should return 422
  { nodes: threeThousandNodes },
  // Overlapping node ranges
  {
    nodes: [
      { start: 0, end: 500, hash: VALID_HEX_64 },
      { start: 250, end: 750, hash: VALID_HEX_64 },
    ],
  },
  // start > end in a node
  { nodes: [{ start: 500, end: 0, hash: VALID_HEX_64 }] },
  // Zero-width node (start === end)
  { nodes: [{ start: 500, end: 500, hash: VALID_HEX_64 }] },
  // Negative start
  { nodes: [{ start: -1, end: 499, hash: VALID_HEX_64 }] },
  // Very large start/end values
  {
    nodes: [{
      start: Number.MAX_SAFE_INTEGER - 500,
      end: Number.MAX_SAFE_INTEGER,
      hash: VALID_HEX_64,
    }],
  },
  // Missing nodes field entirely
  { root: VALID_HEX_64 },
  // Empty nodes array — should return 422 (min 1)
  { nodes: [] },
  // Spurious fields alongside valid nodes
  {
    nodes: [{ start: 0, end: 1000, hash: VALID_HEX_64 }],
    bucketSize: 1,
    entries: [],
  },
];

Deno.test("Proves POST /diff/:topic never crashes on semantically wrong diff bodies", async () => {
  const eventCfg = [{ name: "events" }];
  const objectCfg = [{ name: "objects" }];
  const { fetch, cleanup } = await makePersistentServer(eventCfg, objectCfg);
  try {
    for (const [bodyIdx, body] of STRUCTURED_DIFF_BODIES.entries()) {
      for (const topic of ["events", "objects"]) {
        const res = await fetch(`/diff/${topic}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        await assertNoCrash(res, `POST /diff/${topic} body=${bodyIdx}`);
      }
    }
  } finally {
    await cleanup();
  }
});

Deno.test("Proves auth middleware never crashes on arbitrary Authorization headers", async () => {
  const { fetch, cleanup } = await makeUnauthContext([{ name: "events" }]);
  try {
    for (const authHeader of FUZZ_AUTH_HEADERS) {
      const res = await fetch("/events/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({ payload: {} }),
      });
      await assertNoCrash(res, `POST with Authorization: ${authHeader.slice(0, 30)}`);
    }
  } finally {
    await cleanup();
  }
});
