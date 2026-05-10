## Authentication

common-storage uses [Macaroons](https://en.wikipedia.org/wiki/Macaroons_(computer_science)) for authentication. The server holds one root key, stored as an environment variable or secret. Everything else is derived from it.

To give something access, you mint a token and attach caveats to it: which topic it can reach, which HTTP methods it may use, when it expires. The server verifies the HMAC chain locally — no database read, no external call — so this works on a worker. A leaked token is bounded by its caveats, not admin. There is no credential proliferation because there is only one secret; tokens are disposable and scoped.

Minting must be cheap. If producing a token requires navigating a UI or running a server, the access problem returns through the back door. A CLI command along the lines of `common-storage mint <name>` that prints a token is the target UX.

## Metrics

The server emits diagnostic and tracking statistics periodically as content entries into a reserved topic named `common-storage`. Metrics are queryable through the same content API as any other topic, with no separate metrics infrastructure required.

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

GET  /content/:topic          — ?start=<id>&size=<n>  or  ?ids=<id>,<id>,...  or  ?filter=<expr>
GET  /content/:topic/:id
POST /content/:topic
PUT  /content/:topic/:id

POST /diff/:topic

GET    /objects/:topic        — ?filter=<expr>
GET    /objects/:topic/:id
PUT    /objects/:topic/:id
DELETE /objects/:topic/:id
```

`GET /content/:topic` also supports NDJSON streaming when the client sends `Accept: application/x-ndjson`. With `?start=<lastId>` the stream tails all writes from that point forward, emitting entry envelopes in order, including tombstones. The stream is unbounded; the connection stays open until the client disconnects. See Subscriptions for how clients and server subscriptions use this endpoint.

`GET /content/:topic?ids=1,2,5,42` fetches a specific set of entries by ID. This is the second step of set reconciliation: once the client knows which ranges differ, it fetches exactly those entries.

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

The client fetches those ranges via `GET /content/:topic?start=<start>&size=<bucketSize>` and replaces its local state for each range. Both missing and stale entries are caught because the bucket hash covers `id || updatedAt` pairs.

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

`GET /objects/:topic` and `GET /content/:topic` both accept an optional `?filter=` query parameter. The value is a [JMESPath](https://jmespath.org/) expression evaluated against each entry's `payload`. Entries where the expression produces a falsy value — `false`, `null`, `0`, an empty string, or an empty array — are excluded from the result. A malformed expression returns 400. Filtering is applied before pagination, so `size` and `start` refer to the post-filter count. Filtering is not available on the NDJSON streaming path; clients that need filtered streams should filter locally after receipt.

Topic schemas are not exposed through the API. `GET /topic/:topic` does not exist; schemas are a server-side concern only.

## Subscriptions

There are two sync patterns, serving different consumers.

**Server subscriptions** replicate a remote topic into a local one on a schedule. Each subscription in config names a source URL, a local topic, a polling frequency, and an env var holding the remote token. On each tick the server connects to the upstream, runs the diff protocol to identify divergent ranges, fetches those ranges, writes the entries locally (including tombstones), then tails the NDJSON stream briefly to catch any writes that arrived during the diff round-trip before disconnecting. The connection is not persistent; the `frequency` field controls how often the cycle repeats.

**Client sync** is a persistent connection. On connect the client runs the diff protocol to catch up on any gap since it was last online, then opens `GET /content/:topic` with `Accept: application/x-ndjson` and `?start=<lastId>` to tail new writes indefinitely. On disconnect the client reconnects and repeats the same diff-then-tail sequence from its last known state. The client never needs a full re-fetch unless it has been offline longer than the tombstone retention window.

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

`common-storage init` opens `$EDITOR` with the config file at `~/.config/common-storage/config.json` (XDG base dir). A Dockerfile is provided for running common-storage as a hardened container. On exit, the config is validated against the schema. If it is invalid, the errors are printed and the user is asked whether to re-open the editor and fix them; this repeats until the config is valid or the user aborts. Once valid, the command asks how the user wants to run the server — as a systemd user service or as a Docker container — and handles the setup entirely: writing and enabling the service, or building and running the container. The user never interacts with systemd or Docker directly.

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
      get-content.ts
      get-content-entry.ts
      post-content.ts
      put-content-entry.ts
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
