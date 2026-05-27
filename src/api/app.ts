// Hono app setup — middleware registration and route binding
// @work.md

import { Hono } from "hono";
import type { Context } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { registerRoutes } from "./routes/router.ts";
import { getFeedRoute } from "./routes/get-feed.ts";
import { postEventRoute } from "./routes/post-event.ts";
import { getEventsRoute } from "./routes/get-events.ts";
import { getEventRoute } from "./routes/get-event.ts";
import { putEventRoute } from "./routes/put-event.ts";
import { putObjectRoute } from "./routes/put-object.ts";
import { getObjectRoute } from "./routes/get-object.ts";
import { deleteObjectRoute } from "./routes/delete-object.ts";
import { getObjectsRoute } from "./routes/get-objects.ts";
import { postDiffRoute } from "./routes/post-diff.ts";
import { metricsMiddleware } from "./metrics/collector.ts";
import { authMiddleware } from "./middleware/auth.ts";
import { rateLimitMiddleware } from "./middleware/rate-limit.ts";
import { securityHeaders } from "./middleware/security-headers.ts";
import { loggingMiddleware } from "./middleware/logging.ts";
import { MAX_REQUEST_BODY_BYTES } from "../commons/constants.ts";
import { STATUS_CONTENT_TOO_LARGE } from "./commons/statuses.ts";
import type { AppDeps } from "./types.ts";

function bodyTooLarge(ctx: Context): Response {
  return ctx.json({ error: "Request body too large" }, STATUS_CONTENT_TOO_LARGE);
}

export type { AppDeps };

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.use("*", cors());
  app.use("*", bodyLimit({ maxSize: MAX_REQUEST_BODY_BYTES, onError: bodyTooLarge }));
  app.use("*", loggingMiddleware(deps.logger));
  app.use("*", securityHeaders);
  app.use("*", rateLimitMiddleware(deps.storage, deps.rateLimits));
  app.use("*", authMiddleware(deps.config));
  app.use("*", metricsMiddleware(deps.collector));

  registerRoutes(app, [
    { method: "GET",    path: "/feed",               route: getFeedRoute(deps) },
    { method: "GET",    path: "/events/:topic",       route: getEventsRoute(deps) },
    { method: "GET",    path: "/events/:topic/:id",   route: getEventRoute(deps) },
    { method: "PUT",    path: "/events/:topic/:id",   route: putEventRoute(deps) },
    { method: "POST",   path: "/events/:topic",       route: postEventRoute(deps) },
    { method: "GET",    path: "/objects/:topic",      route: getObjectsRoute(deps) },
    { method: "GET",    path: "/objects/:topic/:id",  route: getObjectRoute(deps) },
    { method: "PUT",    path: "/objects/:topic/:id",  route: putObjectRoute(deps) },
    { method: "DELETE", path: "/objects/:topic/:id",  route: deleteObjectRoute(deps) },
    { method: "POST",   path: "/diff/:topic",          route: postDiffRoute(deps) },
  ]);

  return app;
}
