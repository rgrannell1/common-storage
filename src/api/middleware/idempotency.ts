// Idempotency middleware — for POST/PUT routes carrying an Idempotency-Key, replays the cached
// response of an earlier identical request instead of reprocessing it. Scoped per caller (token)
// and topic. DELETE is naturally idempotent and needs no key.
// @work.md

import type { MiddlewareHandler } from "hono";
import type { IReadIdempotencyEntry, IWriteIdempotencyEntry } from "../../storage/capabilities.ts";
import {
  IDEMPOTENCY_NS_POST_EVENT,
  IDEMPOTENCY_NS_PUT_EVENT,
  IDEMPOTENCY_NS_PUT_OBJECT,
  MAX_IDEMPOTENCY_KEY_BYTES,
} from "../../commons/constants.ts";
import { STATUS_CREATED, STATUS_OK, STATUS_UNPROCESSABLE } from "../commons/statuses.ts";

const keyEncoder = new TextEncoder();

// An Idempotency-Key longer than the cap would overflow Deno KV's key-size limit and throw.
function isKeyTooLong(key: string): boolean {
  return keyEncoder.encode(key).length > MAX_IDEMPOTENCY_KEY_BYTES;
}

type IdempotencyStorage = IReadIdempotencyEntry & IWriteIdempotencyEntry;

// The cached HTTP outcome of a prior identical request. Only success statuses are stored.
type CachedResponse = { status: 200 | 201; body: unknown };

// The idempotent route matched from the request path, with its cache namespace and topic.
type IdempotentRoute = { namespace: string; topic: string };

// Resolves the cache namespace and topic from method and path segments. Only the three write
// routes are idempotent; everything else (reads, DELETE, /diff, /feed) returns undefined and is
// passed through. Derived from the path rather than Hono's routePath, which reports the wildcard
// pattern inside a use("*") middleware.
function matchIdempotentRoute(method: string, pathname: string): IdempotentRoute | undefined {
  const segments = pathname.split("/").filter(Boolean);
  const [resource, topic] = segments;

  if (method === "POST" && resource === "events" && segments.length === 2) {
    return { namespace: IDEMPOTENCY_NS_POST_EVENT, topic };
  }
  if (method === "PUT" && resource === "events" && segments.length === 3) {
    return { namespace: IDEMPOTENCY_NS_PUT_EVENT, topic };
  }
  if (method === "PUT" && resource === "objects" && segments.length === 3) {
    return { namespace: IDEMPOTENCY_NS_PUT_OBJECT, topic };
  }
  return undefined;
}

// Only success responses are cached; replaying a cached 4xx/5xx would mask a later valid retry.
function isCacheable(status: number): boolean {
  return status === STATUS_OK || status === STATUS_CREATED;
}

export function idempotencyMiddleware(storage: IdempotencyStorage): MiddlewareHandler {
  return async (ctx, next) => {
    const route = matchIdempotentRoute(ctx.req.method, ctx.req.path);
    const key = ctx.req.header("Idempotency-Key");

    // Pass through routes that are not idempotent or requests without a key.
    if (route === undefined || key === undefined) {
      await next();
      return;
    }

    // Reject over-long keys before they reach KV, rather than crashing on the key-size limit.
    // 422 (not 400): the header is well-formed but out of range, matching the payload-size cap.
    if (isKeyTooLong(key)) {
      return ctx.json({ error: "idempotency key too long" }, STATUS_UNPROCESSABLE);
    }

    const { namespace, topic } = route;
    // Scope per caller so two tokens reusing the same key do not share a cache slot.
    const scoped = `${namespace}:${ctx.get("tokenId") ?? "unknown"}`;

    const cached = await storage.readIdempotencyEntry(scoped, topic, key) as CachedResponse | null;
    if (cached !== null) {
      return ctx.json(cached.body, cached.status);
    }

    await next();

    if (isCacheable(ctx.res.status)) {
      const body = await ctx.res.clone().json();
      const statusCode = ctx.res.status as 200 | 201;
      await storage.writeIdempotencyEntry(scoped, topic, key, { status: statusCode, body });
    }
  };
}
