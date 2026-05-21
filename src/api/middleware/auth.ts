// Auth middleware — verifies Macaroon bearer tokens on every request
// @work.md

import type { MiddlewareHandler } from "hono";
import type { Config } from "../../commons/config.ts";
import { verifyToken } from "../../commons/auth.ts";
import { TOPIC_ROUTE_PREFIXES } from "../../commons/constants.ts";
import { STATUS_UNAUTHORIZED, STATUS_FORBIDDEN } from "../commons/statuses.ts";

type TopicRoutePrefix = typeof TOPIC_ROUTE_PREFIXES[number];

// Type guard — widens the check for Array.includes which requires the element type.
function isTopicPrefix(segment: string): segment is TopicRoutePrefix {
  return (TOPIC_ROUTE_PREFIXES as readonly string[]).includes(segment);
}

function topicFromPath(pathname: string): string | undefined {
  const parts = pathname.split("/");
  if (parts.length >= 3 && isTopicPrefix(parts[1])) {
    return parts[2] || undefined;
  }
  return undefined;
}

function bearerToken(authorization: string | undefined): string | undefined {
  if (!authorization?.startsWith("Bearer ")) return undefined;
  return authorization.slice("Bearer ".length).trim() || undefined;
}

export function authMiddleware(config: Config): MiddlewareHandler {
  const rootKey = Deno.env.get(config.rootKey);
  if (!rootKey) {
    throw new Error(`Root key env var '${config.rootKey}' is not set`);
  }

  return async (ctx, next) => {
    const token = bearerToken(ctx.req.header("Authorization"));

    if (token === undefined) {
      return ctx.json({ error: "missing token" }, STATUS_UNAUTHORIZED);
    }

    const topic = topicFromPath(ctx.req.path);
    const result = verifyToken(rootKey, token, ctx.req.method, topic);

    if (!result.ok) {
      if (result.error.kind === "invalid") {
        return ctx.json({ error: "invalid token" }, STATUS_UNAUTHORIZED);
      }
      return ctx.json({ error: result.error.reason }, STATUS_FORBIDDEN);
    }

    await next();
  };
}
