# Work

## Requirements

common-storage replaces the old common-storage system. The old system worked — federated data sharing ran for years without issue, HTTP streaming was fast, and REST with Basic Auth kept clients simple — but three problems are worth fixing in the rewrite.

The first is authentication. The old system required writing auth code by hand. The new system should use an existing protocol rather than a custom implementation, and that protocol should not depend on a SaaS product. The chosen library is macaroons.js.

The second is the data model. The old system was append-only, which was too limiting. The new system should allow entries to be modified after the fact.

The third is access. The old system spread credentials across many accounts, making API access cumbersome. Client websites ended up building their own control plane on top of common-storage rather than talking to it directly. The new system should make access simple enough that clients can use it without a separate layer in front of it.

The server must support efficient set reconciliation between client and server state. Paginated reads must be extendable to accept a set of specific IDs so clients can fetch exactly the entries they need after reconciliation. A POST /diff/:topic endpoint must allow a client to send a root hash and a set of bucket hashes covering fixed-width ID ranges; the server responds with which ranges differ so the client can refetch only those.

Every route handler must decompose into exactly four steps, each returning an Either type on failure:

1. ParseRequest(req, schema) — parses and validates the full inbound request (headers, query params, path params, body) against a schema; returns a typed params object or an error
2. ComputeResponse(params) — performs the business logic for this route; takes the parsed params and returns a typed result or an error
3. ParseResponse(result, schema) — validates the outbound value against a response schema before it is sent; returns a validated response object or an error
4. SendResponse(validated) — serialises and sends the HTTP response

Cross-cutting concerns (auth, CORS, rate limiting, logging, security headers) are handled in middleware and never appear inside a route handler. The four steps above deal solely with request parsing, business logic, response validation, and serialisation — nothing else.

All Zod scalar field schemas — topic name, timestamp, title, version, pagination params, and so on — are defined once in `src/api/parsers/schemas.ts`. Reusable composed schemas (topic summary, subscription summary, content entry) are also assembled there from those scalars. Route files define their own request and response `z.object(...)` schemas inline, importing only the scalar and shared object schemas they need as building blocks; no scalar constraint is defined in more than one place, and no route-specific schema leaks into the shared file. TypeScript types are inferred from the Zod schemas rather than declared separately.

`GET /feed` returns a JSON object containing an array of topic summaries each with the topic name, entry count, and last-updated timestamp; and an array of active subscriptions each with the source URL, local topic name, polling frequency, and creation timestamp. The `?human` query flag is accepted but reserved for future pretty-printing; it does not change the response structure.

`cs init` creates a minimal config skeleton at `~/.config/common-storage/config.json` if one does not already exist, then exits. If the file already exists, the command reports its path and does nothing. The XDG base directory (`$XDG_CONFIG_HOME`, defaulting to `~/.config`) is respected when locating the config file.

`cs validate` reads the config file and validates it against the Zod config schema. If the file is missing, not valid JSON, or fails schema validation, the errors are printed and the command exits non-zero. On success it prints the config path and exits zero.

The config supports explicit topic definitions for both event and object topics. Event topics are declared as an array of objects each with a `name` and an optional `schema` field (a path to a JSON Schema file for payload validation). Object topics are declared the same way. If `schema` is omitted for a topic, any JSON value is accepted as a payload. The `SchemasConfig` folder-path approach is replaced by these explicit topic lists. Topic names must be between 1 and 128 characters.

## Design

## Authentication

common-storage uses [Macaroons](https://en.wikipedia.org/wiki/Macaroons_(computer_science)) for authentication. The server holds one root key, stored as an environment variable or secret. Everything else is derived from it.

To give something access, you mint a token and attach caveats to it: which topic it can reach, which HTTP methods it may use, when it expires. The server verifies the HMAC chain locally — no database read, no external call — so this works on a worker. A leaked token is bounded by its caveats, not admin. There is no credential proliferation because there is only one secret; tokens are disposable and scoped.

Minting must be cheap. If producing a token requires navigating a UI or running a server, the access problem returns through the back door. A CLI command along the lines of `common-storage mint <name>` that prints a token is the target UX.

## Metrics

The server emits diagnostic and tracking statistics periodically as content entries into a reserved topic named `common-storage`. Metrics are queryable through the same content API as any other topic, with no separate metrics infrastructure required.

`MetricsCollector` must persist counters to Deno KV on every increment and read from KV when computing rates. In-memory counters are not acceptable — Deno Deploy cold-starts a fresh isolate per request, so any state held in memory resets immediately and metrics never accumulate. The `IStorageBackend` interface already includes a metrics sub-interface; the KV implementation of that interface is the correct home for counter persistence.

## Logging

The server logs to stderr only. There is no console logger and no storage logger — stderr is what systemd and Docker capture, and it does not pollute stdout with operational noise.

The logger is an `ILogger` interface with two methods:

```typescript
interface ILogger {
  info(message: string, request: Request | undefined, data: Record<string, unknown>): void;
  error(message: string, request: Request | undefined, data: Record<string, unknown>): void;
}
```

Log line format follows the old common-storage convention:
- With a request: `METHOD URL | message | data={"key":"value"}`
- Without a request: `message | data={"key":"value"}`

The logger is injected into every component that needs it — middleware, route handlers, subscription scheduler — and never imported directly. Tests pass a no-op logger; no log output appears in test runs.

Log sites mirror the old system:
- Every inbound request (method, URL) — in request-logging middleware
- Unhandled errors during request processing (method, URL, error message and stack)
- Subscription lifecycle: sync start (source, topic, frequency), fetch (nextId, topic), sync complete (nextId, topic), overdue check, sync failure (error message, stack, source)

`StorageLogger` is explicitly out of scope.

## Testing

The server is fuzz-tested using `../peach.ts` and integration-tested using `@deno-libs/superfetch`, which spins up a real HTTP server and tests against it over the network. Unit tests are not the primary concern; the integration tests are the source of truth for correctness.

Shared setup and stubs are factored out and reused across tests rather than duplicated. Each test is named to state a general property: "Proves &lt;X&gt; about &lt;Y&gt;" — describing what is true about the system, not what steps the test performs.

## Topic Types

There are two topic types, declared in config.

**Event topics** hold an ordered log of entries. The server assigns a monotonically increasing integer `id`. `createdAt` is set at write time. `payload` is the user-supplied JSON validated against the topic schema.

**Object topics** hold a dictionary of entries addressed by a user-supplied `id`. `createdAt` is set at first write; `updatedAt` is set on every subsequent write. `payload` is validated against the topic schema. Deletion writes a tombstone — `payload: null`, `updatedAt` set to the deletion time — rather than removing the entry. Tombstones participate in diff hash computation and flow through the NDJSON stream, so deletes propagate to all subscribers. The server garbage-collects tombstones after a configurable retention window; a subscriber offline longer than the retention window must do a full reconciliation on reconnect.

Both types share the same envelope:

```json
{
  "id": "user-supplied or server-assigned",
  "createdAt": 1714393600000,
  "updatedAt": 1714393600000,
  "payload": { } | null
}
```

`payload: null` denotes a tombstone (deleted object entry).

## Routes

```
GET  /feed

GET  /events/:topic          — ?start=<id>&size=<n>  or  ?ids=<id>,<id>,...  or  ?filter=<expr>
GET  /events/:topic/:id
POST /events/:topic
PUT  /events/:topic/:id

POST /diff/:topic

GET    /objects/:topic        — ?filter=<expr>
GET    /objects/:topic/:id
PUT    /objects/:topic/:id
DELETE /objects/:topic/:id
```

`GET /events/:topic` also supports NDJSON streaming when the client sends `Accept: application/x-ndjson`. With `?start=<lastId>` the stream tails all writes from that point forward, emitting entry envelopes in order, including tombstones. The stream is unbounded; the connection stays open until the client disconnects. See Subscriptions for how clients and server subscriptions use this endpoint.

`GET /events/:topic?ids=1,2,5,42` fetches a specific set of entries by ID. This is the second step of set reconciliation: once the client knows which ranges differ, it fetches exactly those entries.

`POST /diff/:topic` reconciles client and server state. The protocol differs by topic type.

**Event topics** use a flat bucket hash tree. The client divides the topic's integer ID space into fixed-width buckets, computes a hash per bucket, and sends all bucket hashes along with a root hash covering them all.

*Bucket hash construction.* For a given bucket covering IDs [start, end), the hash is SHA-256 over the concatenation of `id || updatedAt` for every entry in that range, where each value is an 8-byte big-endian unsigned integer, entries sorted ascending by ID. An empty bucket hashes to SHA-256 of an empty input. The root hash is SHA-256 over the concatenation of all bucket hashes in order.

*Request body.*
```json
{
  "bucketSize": 500,
  "root": "<hex>",
  "buckets": [
    { "start": 0, "end": 500, "hash": "<hex>" },
    { "start": 500, "end": 1000, "hash": "<hex>" }
  ]
}
```

*Response.* If the root hash matches, `204 No Content`. Otherwise the server returns the ranges where its bucket hash differs from the client's:
```json
{
  "ranges": [
    { "start": 0, "end": 500 },
    { "start": 1500, "end": 2000 }
  ]
}
```

The client fetches those ranges via `GET /events/:topic?start=<start>&size=<bucketSize>` and replaces its local state for each range. Both missing and stale entries are caught because the bucket hash covers `id || updatedAt` pairs.

**Object topics** use a flat entry map. String IDs have no natural numeric ordering, so range buckets are not meaningful. Instead, the client sends every ID it holds alongside a hash of that entry's `updatedAt`.

*Entry hash construction.* For each entry, the hash is SHA-256 of `updatedAt` as an 8-byte big-endian unsigned integer. Tombstones are included — a deleted entry still has an `updatedAt` and participates in the diff.

*Request body.*
```json
{
  "entries": [
    { "id": "abc", "hash": "<hex>" },
    { "id": "def", "hash": "<hex>" }
  ]
}
```

*Response.* `204 No Content` if the server's state matches exactly. Otherwise the server returns IDs that differ — entries where the client's hash does not match the server's, plus entries the server holds that the client did not mention:
```json
{
  "ids": ["abc", "xyz"]
}
```

The client fetches those entries via `GET /objects/:topic/:id` and applies them locally, including tombstones. IDs the client holds that the server did not mention and did not return are left untouched; within the tombstone retention window the server will always have a tombstone for anything it has deleted, so a missing ID can only mean the client has an entry the server has never seen.

`POST` and `PUT` accept an `Idempotency-Key` header. The server stores the key and response scoped per topic; a retry with the same key returns the cached response without reprocessing. `DELETE` is idempotent.

`GET /objects/:topic` and `GET /events/:topic` both accept an optional `?filter=` query parameter. The value is a [JMESPath](https://jmespath.org/) expression evaluated against each entry's `payload`. Entries where the expression produces a falsy value — `false`, `null`, `0`, an empty string, or an empty array — are excluded from the result. A malformed expression returns 400. Filtering is applied before pagination, so `size` and `start` refer to the post-filter count. Filtering is not available on the NDJSON streaming path; clients that need filtered streams should filter locally after receipt.

Topic schemas are not exposed through the API. `GET /topic/:topic` does not exist; schemas are a server-side concern only.

## Subscriptions

There are two sync patterns, serving different consumers.

**Server subscriptions** replicate a remote topic into a local one on a schedule. Each subscription in config names a source URL, a local topic, a polling frequency, and an env var holding the remote token. On each tick the server connects to the upstream, runs the diff protocol to identify divergent ranges, fetches those ranges, writes the entries locally (including tombstones), then tails the NDJSON stream briefly to catch any writes that arrived during the diff round-trip before disconnecting. The connection is not persistent; the `frequency` field controls how often the cycle repeats.

**Client sync** is a persistent connection. On connect the client runs the diff protocol to catch up on any gap since it was last online, then opens `GET /events/:topic` with `Accept: application/x-ndjson` and `?start=<lastId>` to tail new writes indefinitely. On disconnect the client reconnects and repeats the same diff-then-tail sequence from its last known state. The client never needs a full re-fetch unless it has been offline longer than the tombstone retention window.

## Status Codes

| Code | Meaning |
|------|---------|
| 200  | OK |
| 201  | Content written |
| 400  | Unparseable request |
| 401  | Missing or invalid token |
| 403  | Valid token, caveats don't cover this |
| 404  | Topic or entry not found |
| 422  | Validation failure (schema, field types, range) |
| 429  | Rate limit hit |
| 500  | Server error |

400 is narrow — the request body could not be parsed at all. 422 covers everything that is well-formed but semantically wrong.

## Application Layer

The server speaks HTTP with JSON bodies. Authentication uses Macaroon bearer tokens in the `Authorization` header. The HTTP framework is Hono, which is lightweight, worker-compatible, and has good Deno support.

CORS is applied in middleware to all routes. Security headers are set on every response: `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `X-XSS-Protection`.

The API is structured by functional decomposition with no mixed concerns. Cross-cutting concerns — authentication, rate limiting, CORS, security headers, logging — live in middleware only. Route handlers deal solely with business logic and know nothing about auth or observability. Each function does one thing.

Route construction follows a data-over-code principle. Routes are declared as data — method, path, middleware stack, handler — and registered by a single builder. No boilerplate is repeated per route; the shape of a route is specified once and applied uniformly.

## Rate Limiting

All requests are rate-limited at two levels: per-IP and global. Both use a sliding window counter stored in KV. The IP is read from the `CF-Connecting-IP` header, since the server sits behind Cloudflare. A 429 is returned on breach of either limit, with no exceptions — including for the server's own operator.

Per-IP counters are bounded by a bloom filter. When a request arrives, the filter is checked first; IPs not present are added and allowed through. IPs that are present get the full sliding window check. This caps memory and KV growth regardless of how many distinct IPs appear. False positives — a new IP incorrectly treated as known — are acceptable given that strict limiting is an explicit goal.

Rotating the bloom filter periodically prevents it from filling entirely and losing its usefulness.

## CLI

`cs init` creates a minimal config skeleton at `~/.config/common-storage/config.json` (XDG base dir) if one does not already exist, then exits. If the file already exists, it reports the path and does nothing.

`cs validate` reads and validates the config against the Zod schema. Prints errors and exits non-zero on failure; prints the config path and exits zero on success.

`common-storage mint <name>` derives and prints a Macaroon token for the named token definition in config. `common-storage mint` with no arguments prints all name/token pairs.

common-storage ships an HTTP API client as a submodule. The CLI syntax is `<verb> <noun> -p <value>`, mapping directly onto the HTTP API. Server URLs are aliased in config; by default a `local` alias points to `http://localhost` and authenticates with a root token derived from the root key — no separate token configuration needed for local use. Remote aliases carry their own scoped token defined in config.

## Folder Structure

```
main.ts                   server entry point
deno.json                 imports map and tasks
bs/                       build scripts
tests/                    integration tests and shared stubs
src/
  commons/
    auth.ts               Macaroon types and interfaces
    constants.ts          shared constants
    types.ts              Result types, shared interfaces, config schema
  api/
    app.ts                Hono app setup, middleware and route registration
    storage/
      backend.ts          IStorageBackend and sub-interfaces
      kv.ts               Deno KV implementation
    routes/
      router.ts           data-driven route builder and registration
      get-feed.ts
      get-events.ts
      get-event.ts
      post-event.ts
      put-event.ts
      get-objects.ts
      get-object.ts
      put-object.ts
      delete-object.ts
    middleware/
      auth.ts             Macaroon verification
      rate-limit.ts       sliding window per-IP and global rate limiting
      cors.ts             CORS headers
      security-headers.ts response security headers
    metrics/
      metrics.ts          periodic metrics emission to the common-storage topic
    parsers/
      headers.ts          request header parsing, returning Result types
      schema.ts           Ajv-based topic payload validation, returning Result types
    commons/
      cache.ts            idempotency key cache
      statuses.ts         HTTP status code constants
      errors.ts           typed API error definitions
      responses.ts        Result-to-response translation
  cli/
    mod.ts                CLI entry point
    commands/
      init.ts             common-storage init
      mint.ts             common-storage mint
      client.ts           HTTP API client submodule
```

## Build System

`rs` is the build system, running executable scripts from `./bs/`. Common commands: `rs test`, `rs lint`, `rs build`, `rs dev`.

## Types and Validation

TypeScript is strict throughout — `noImplicitAny`, no `var`. Dependencies come from JSR or npm specifiers; `deno.land/x` and `esm.sh` URLs are not used. The imports map lives in `deno.json`.

Zod handles validation for everything the server owns: request bodies, config structure, API responses. Ajv handles user-defined JSON Schema validation for topic payloads, since those arrive as arbitrary JSON at runtime and Zod cannot validate against them. The two coexist — each does what it is good at.

Error handling uses hand-rolled Result types throughout:

```typescript
type Ok<T> = { ok: true; value: T }
type Err<E> = { ok: false; error: E }
type Result<T, E> = Ok<T> | Err<E>
```

Internal functions return `Result<T, E>` rather than throwing. Parsers and validators must return Result types — never throw. At the API boundary, route handlers translate Results into the appropriate HTTP status codes and JSON responses. Errors do not escape into middleware untyped.

Every part of an inbound request that is read — headers, query params, path params, body — must pass through a dedicated parser that returns a Result type. Every outbound response must pass through a dedicated response builder. Nothing is read from a request or written to a response directly inside a handler.

## Storage

The storage backend is Deno KV, hidden behind an `IStorageBackend` interface composed of focused sub-interfaces — one per concern (content, topics, subscriptions, idempotency keys, rate limiting, metrics). This makes the backend swappable; a Cloudflare Durable Objects implementation would satisfy the same interface without touching anything else.

No concrete implementation exists without a corresponding interface. This applies to the storage backend, the HTTP client, the config loader, the Macaroon verifier, and any other component with more than one plausible implementation.

All dependencies are injected. No component reaches for a concrete implementation directly; everything it needs is passed in. This ensures any dependency can be stubbed in tests or swapped for an alternative implementation without touching the component itself.

## Infrastructure as Code

Topics, schemas, subscriptions, and token definitions all live in a single config. The server reads this on startup; nothing requires an API call to set up.

Config is either a JSON file or an executable that prints JSON to stdout — the same pattern Ansible uses for dynamic inventory. The server detects which it has, runs the executable if needed, and validates the result against a schema before starting. This lets static and programmatically-generated configs coexist under the same interface.

Token definitions sit alongside everything else in config: a name, a set of caveats (topic, allowed methods, optional expiry). Because Macaroon verification is HMAC-based, a token is deterministically derivable from the root key and its caveats. Given the same root key and the same config entry, `common-storage mint <name>` always produces the same token. Tokens never need to be stored; they can be regenerated at any time.

The root key is the one secret, held as an environment variable. Tokens do not expire; rotation of the root key invalidates all derived tokens immediately — global revocation in one operation. The config itself contains no secrets and can be checked into version control.

## Snags

### Untested

### Snag List

- [x] #1 `fixed` — `src/api/app.ts:22` — `AppDeps` is defined in app.ts instead of a dedicated types file
      > move to type file
- [x] #2 `fixed` — `src/api/commons/responses.ts:18` — `SuccessHandler` and `ErrorHandler` type aliases lack documentation
      > document these briefly
- [x] #3 `fixed` — `src/api/metrics/collector.ts:45` — `#recordBucket` private method lacks a doc comment
      > document what this does
- [x] #4 `fixed` — `src/api/metrics/collector.ts:47` — magic number `60_000` (ms per minute) is inlined rather than named
      > factor out constants to named variables
- [x] #5 `fixed` — `src/api/metrics/collector.ts:57` — `#trimBuckets` private method lacks a doc comment
      > document what this does
- [x] #6 `fixed` — `src/api/metrics/collector.ts:63` — `#rateForMinutes` private method lacks a doc comment
      > document what this does
- [x] #7 `fixed` — `src/api/middleware/auth.ts:13` — user flagged `isTopicPrefix` body (no comment left)
      >
- [x] #8 `fixed` — `src/api/middleware/auth.ts:17` — user flagged `topicFromPath` body lines 17–21 (no comment left)
      >
- [x] #9 `wontfix` — `src/api/middleware/rate-limit.ts:50` — bloom filter removed entirely; first-time IPs now get a KV counter directly
      > DO NOT IMPLEMENT THIS YOURSELF. USE A LIBRARY
- [x] #10 `fixed` — `src/api/routes/get-events.ts:41` — `buildNdjsonStream` lacks a doc comment
      > document this
- [x] #11 `fixed` — `src/api/routes/get-events.ts:51` — `getEvents` handles two distinct paths (stream and paginated) in one body; split into focused helpers
      > large function
- [x] #12 `fixed` — `src/api/routes/post-diff.ts:44` — functions in post-diff.ts lack doc comments
      > document functions in here
- [x] #13 `fixed` — `src/api/storage/kv/events.ts:1` — file is too large; decompose into a folder with subfiles per concern
      > this file is ENORMOUS. Decompose into a folder + subfiles
- [x] #14 `fixed` — `src/api/storage/kv/index.ts:13` — base KV utility methods (get/set/delete/list) should be extracted to their own file
      > own file please
- [x] #15 `fixed` — `src/commons/auth.ts:19` — `AuthError` should move to a central types location alongside other error types
      > lift error response types somewhere more central across the package
- [x] #16 `fixed` — `src/api/metrics/emitter.ts:9` — `METRICS_INTERVAL_MS` and `METRICS_OBJECT_ID` are local constants; move to `src/commons/constants.ts`
      > constants file
- [x] #17 `fixed` — `src/api/routes/get-feed.ts:40` — topics build block lacks a comment
      > document this codeblock
- [x] #18 `fixed` — `src/api/routes/router.ts:14` — `HttpMethod` type is defined inline; derive from a constant in `src/commons/constants.ts`
      > constants file
- [x] #19 `fixed` — `src/api/storage/kv/events/diff.ts:15-16` — `bucketStart` computation should be extracted to a named helper
      > factor this out
- [x] #20 `fixed` — `src/api/storage/kv/events/diff.ts:26` — sort comparator lambda `(a, b) => a.id - b.id` should be extracted to a named function
      > factor out lambda
- [x] #21 `fixed` — `src/api/storage/kv/events/read.ts:33` — ids-branch block lacks a comment
      > document this block
- [x] #22 `fixed` — `src/api/storage/kv/events/read.ts:37` — paginated-fetch block lacks a comment
      > document this block
- [x] #23 `fixed` — `src/api/storage/kv/events/stream.ts:9` — `STREAM_POLL_INTERVAL_MS` should move to `src/commons/constants.ts`
      > lift to constants
- [x] #24 `fixed` — `src/api/storage/kv/hashing.ts:35-36` — packed `id||updatedAt` big-endian layout lacks a comment explaining the choice
      > document these choices, why this approach?
- [x] #25 `fixed` — `src/api/subscriptions/client.ts:7` — `TAIL_DURATION_MS` should move to `src/commons/constants.ts`
      > lift to constants
- [x] #26 `fixed` — `src/api/subscriptions/diff.ts:8` — `DEFAULT_BUCKET_SIZE` should move to `src/commons/constants.ts` and value reduced to 100
      > lift to constants. Smaller buckets. Buckets of 100
- [x] #27 `fixed` — `src/api/subscriptions/scheduler.ts:18` — magic `1_000` ms-per-second multiplier should be a named constant
      > lift 1_000 to a constant
- [x] #28 `fixed` — `src/api/subscriptions/sync.ts:51` — magic number `500` passed to `fullFetch` should use `DEFAULT_BUCKET_SIZE` from constants
      > magic number, move to constants
- [x] #29 `fixed` — `src/api/subscriptions/sync.ts:60-68` — range-fetch and tail loop should be factored into a helper function
      > factor out this logic
- [x] #30 `fixed` — `src/cli/commands/init.ts:10` — `"COMMON_STORAGE_ROOT_KEY"` string literal should be a named constant
      > factor out to constants
- [x] #31 `fixed` — `src/cli/prompt.ts:3` — `promptYesNo` is not imported anywhere outside `setup.ts`; file is dead code
      > dead code?
- [x] #32 `fixed` — `src/cli/setup.ts:8` — `setup.ts` is not imported anywhere; entire file is dead code
      > dead code.
- [x] #33 `fixed` — `src/commons/config.ts:5` — `HttpMethod` Zod enum re-declares the HTTP methods list; derive from a shared constant in `src/commons/constants.ts`
      > use methods from constants
- [x] #34 `fixed` — `main.ts:33` — entry point uses `Deno.serve()` which is not the Deno Deploy pattern; needs `export default { fetch }` satisfying `Deno.ServeDefaultExport`
      > Deno Deploy compatibility
- [x] #35 `fixed` — `src/api/metrics/emitter.ts:11` — `setInterval` blocks isolate from idling on Deno Deploy, preventing deployments from being replaced; replace with `Deno.cron()`
      > Deno Deploy compatibility
- [x] #36 `fixed` — `src/api/subscriptions/scheduler.ts:13` — `setInterval` per subscription has the same isolate-idle problem; replace with `Deno.cron()` (note: crons must be registered at module load, so subscriptions must be registered statically from config)
      > Deno Deploy compatibility
- [x] #37 `fixed` — `main.ts:15-16` — config is loaded from the XDG path (`~/.config/...`) which does not exist on Deno Deploy; support a `CMSTR_CONFIG_PATH` env var override so Deploy can point to a relative `./config.json` committed alongside the code
      > Deno Deploy compatibility

- [x] #38 `fixed` — `tests/fuzz.test.ts` — `?filter=` JMESPath param is not fuzz-tested; arbitrary strings fed to the JMESPath parser may crash or return 500 instead of 400
      > malformed expressions should return 400; the parser may not be hardened against adversarial input

- [x] #39 `fixed` — `tests/fuzz.test.ts` — path params (`:topic`, `:id`) are not fuzz-tested; long names, null bytes, unicode, and path-traversal strings may cause KV key issues or routing errors
      > 128-char topic name limit, special characters in KV keys, `../foo` and `%00` variants

- [x] #40 `fixed` — `tests/fuzz.test.ts` — `POST /diff/:topic` body is not fuzz-tested with structurally valid but semantically wrong payloads; hashes of wrong length, non-hex chars, thousands of buckets, `bucketSize: 0`, and overlapping ranges are untested
      > passes schema parse step but hits business logic — likely crash surface

- [x] #41 `fixed` — `tests/fuzz.test.ts` — `?start=` param is not fuzz-tested; non-integers, negatives, `NaN`, `Infinity`, and very large values may return 500 instead of 4xx

### Passing
