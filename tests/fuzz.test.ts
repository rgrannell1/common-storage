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
      const encodedId = encodeURIComponent(rawId);
      const res = await fetch(`/objects/objects/${encodedId}`, buildFuzzInit("PUT"));
      await assertNoCrash(res, `PUT /objects/objects/${rawId} iter=${idx}`);
    }
  } finally {
    await cleanup();
  }
});

Deno.test("Proves POST /diff/:topic never crashes on arbitrary bodies for both topic types", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "events" }], [{ name: "objects" }]);
  try {
    for (let idx = 0; idx < FUZZ_ITERATIONS; idx++) {
      const topic = density(0, 2)() === 0 ? "events" : "objects";
      const res = await fetch(`/diff/${topic}`, buildFuzzInit("POST"));
      await assertNoCrash(res, `POST /diff/${topic} iter=${idx}`);
    }
  } finally {
    await cleanup();
  }
});

Deno.test("Proves write routes never crash when given arbitrary topic names", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "events" }], [{ name: "objects" }]);
  try {
    for (const topic of FUZZ_TOPIC_NAMES) {
      const encoded = encodeURIComponent(topic);

      const postEventRes = await fetch(`/events/${encoded}`, buildFuzzInit("POST"));
      await assertNoCrash(postEventRes, `POST /events/${topic}`);

      const putEventRes = await fetch(`/events/${encoded}/1`, buildFuzzInit("PUT"));
      await assertNoCrash(putEventRes, `PUT /events/${topic}/1`);

      const putObjectRes = await fetch(`/objects/${encoded}/someId`, buildFuzzInit("PUT"));
      await assertNoCrash(putObjectRes, `PUT /objects/${topic}/someId`);

      const diffRes = await fetch(`/diff/${encoded}`, buildFuzzInit("POST"));
      await assertNoCrash(diffRes, `POST /diff/${topic}`);
    }
  } finally {
    await cleanup();
  }
});

Deno.test("Proves GET routes never crash on arbitrary query parameter values", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "events" }], [{ name: "objects" }]);
  try {
    for (const rawVal of FUZZ_QUERY_VALUES) {
      const encoded = encodeURIComponent(rawVal);

      const feedRes = await fetch(`/feed?human=${encoded}`);
      await assertNoCrash(feedRes, `GET /feed?human=${rawVal}`);

      const eventsFilterRes = await fetch(`/events/events?filter=${encoded}`);
      await assertNoCrash(eventsFilterRes, `GET /events/events?filter=${rawVal}`);

      const eventsPagRes = await fetch(`/events/events?start=${encoded}&size=${encoded}`);
      await assertNoCrash(eventsPagRes, `GET /events/events?start=${rawVal}&size=${rawVal}`);

      const eventsIdsRes = await fetch(`/events/events?ids=${encoded}`);
      await assertNoCrash(eventsIdsRes, `GET /events/events?ids=${rawVal}`);

      const objectsFilterRes = await fetch(`/objects/objects?filter=${encoded}`);
      await assertNoCrash(objectsFilterRes, `GET /objects/objects?filter=${rawVal}`);
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
