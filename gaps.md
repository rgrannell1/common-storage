# Gaps

Items not yet implemented relative to common-storage, grouped by priority.

## Not started

| Feature | Notes |
|---|---|
| Macaroon auth | Middleware dir is empty; no token verification on any route. |
| Rate limiting | `src/api/middleware/` placeholder only. Design: 180 req/60s sliding window, 5-min throttle, per-IP via bloom filter. |
| Security headers | HSTS, X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy. Set none currently. |
| NDJSON streaming | `GET /events/:topic` with `Accept: application/x-ndjson`. `RouteSuccess` has a `stream` kind; no route uses it. |
| `POST /diff/:topic` | Full diff/reconciliation endpoint. Not stubbed. |
| Subscriptions | `getSubscriptions()` returns `[]`. No polling, no diff-then-tail logic. |
| `cs mint` | CLI parses the command; no handler wired. |
| `cs http` client | All HTTP subcommands parsed; none wired. |
| Docker setup | `setupDocker()` prints "not yet implemented". |
| Metrics emission | `src/api/metrics/` is empty. |

## Partially started

| Feature | State |
|---|---|
| Schema validation | `TopicConfig.schema` stored at topic creation; `writeEvent`/`upsertObject` never read it — payloads are not validated against user schemas. |
| Idempotency-Key | `IReadIdempotencyEntry`/`IWriteIdempotencyEntry` implemented in `kv/idempotency.ts`; no route calls them. Header parsed but ignored. |
| `?filter=` | In design for `GET /events/:topic` and `GET /objects/:topic`. Not in any query schema. |

## Test gaps

| Gap | Detail |
|---|---|
| No body assertions | Most tests verify status codes only; wrong-shaped response bodies pass silently. |
| No idempotency tests | No test proves replays return cached responses. |
| No schema validation tests | No test exercises `TopicConfig.schema` enforcement. |
| No object fuzz tests | Only `POST /events/:topic` is fuzz-tested; `PUT /objects/:topic/:id` is not. |
| No concurrent write tests | Atomic CAS retry loops in `writeEvent`/`upsertObject`/`deleteObject` never exercised under contention. |
| `?start=` boundary untested | No test writes N events then fetches `?start=2` to confirm event 1 is excluded. |
