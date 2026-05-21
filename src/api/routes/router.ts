// Data-driven route builder — registers Route objects with the Hono app
// @work.md

import type { Hono, Context } from "hono";
import type { Route, RequestParts } from "../../commons/types/parser.ts";
import type { RouteSuccess, RouteError } from "../../commons/types/responses.ts";
import { sendSuccess, sendError } from "../commons/responses.ts";
import { HTTP_METHODS } from "../../commons/constants.ts";

// Body/Params/HandlerOutput are opaque to the router; only the error and response output types matter
// since those are the only values the router touches (to call sendError/sendSuccess).
// deno-lint-ignore no-explicit-any
type BoundRoute = Route<any, any, any, RouteSuccess, RouteError>;

type HttpMethod = typeof HTTP_METHODS[number];

export type RouteSpec = {
  method: HttpMethod;
  path: string;
  route: BoundRoute;
};

// GET and DELETE carry no body per HTTP spec; parsing one would block on an empty stream
async function extractBody(ctx: Context, method: HttpMethod): Promise<unknown> {
  if (method === "GET" || method === "DELETE") {
    return null;
  }
  return ctx.req.json().catch(() => null);
}

// Executes the four-step pipeline: parseRequest → handle → parseResponse → send
function buildHandler(route: BoundRoute, method: HttpMethod) {
  return async (ctx: Context): Promise<Response> => {
    const body = await extractBody(ctx, method);
    const parts: RequestParts<unknown> = {
      headers: ctx.req.raw.headers,
      url: new URL(ctx.req.url),
      body,
      params: ctx.req.param(),
      signal: ctx.req.raw.signal,
    };

    const parsed = route.parseRequest(parts);
    if (!parsed.ok) return sendError(ctx, parsed.error);

    const result = await route.handle(parsed.value);
    if (!result.ok) return sendError(ctx, result.error);

    const validated = route.parseResponse(result.value);
    if (!validated.ok) return sendError(ctx, validated.error);

    return sendSuccess(ctx, validated.value);
  };
}

// app.on() accepts a method string, enabling registration from data without per-method boilerplate
export function registerRoutes(app: Hono, routes: RouteSpec[]): void {
  for (const spec of routes) {
    app.on(spec.method, spec.path, buildHandler(spec.route, spec.method));
  }
}
