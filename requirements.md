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

`cs init` opens the config file at `~/.config/common-storage/config.json` in `$EDITOR`, creating it with a minimal valid skeleton if it does not yet exist. When the editor exits, the file is parsed as JSON and validated against the Zod config schema. If the file is not valid JSON or fails validation, the errors are printed and the user is asked whether to re-open the editor; this loop repeats until the config is valid or the user declines. Once the config is valid, the user is asked whether to run the server as a systemd user service or as a Docker container; the command handles the full setup without the user interacting with systemd or Docker directly. The XDG base directory (`$XDG_CONFIG_HOME`, defaulting to `~/.config`) is respected when locating the config file.

The config supports explicit topic definitions for both event and object topics. Event topics are declared as an array of objects each with a `name` and an optional `schema` field (a path to a JSON Schema file for payload validation). Object topics are declared the same way. If `schema` is omitted for a topic, any JSON value is accepted as a payload. The `SchemasConfig` folder-path approach is replaced by these explicit topic lists. Topic names must be between 1 and 128 characters.
