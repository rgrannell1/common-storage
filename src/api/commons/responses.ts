// Translates RouteSuccess and RouteError values into Hono responses
// @work.md

import type { Context } from "hono";
import type { RouteSuccess, RouteError } from "../../commons/types/responses.ts";
import {
  STATUS_OK,
  STATUS_CREATED,
  STATUS_NO_CONTENT,
  STATUS_BAD_REQUEST,
  STATUS_NOT_FOUND,
  STATUS_UNPROCESSABLE,
  STATUS_INTERNAL_ERROR,
} from "./statuses.ts";

const NDJSON_CONTENT_TYPE = "application/x-ndjson";

type SuccessHandler<Kind extends RouteSuccess["kind"]> = (ctx: Context, success: Extract<RouteSuccess, { kind: Kind }>) => Response;
type ErrorHandler<Kind extends RouteError["kind"]> = (ctx: Context, error: Extract<RouteError, { kind: Kind }>) => Response;

const SUCCESS_HANDLERS: { [Kind in RouteSuccess["kind"]]: SuccessHandler<Kind> } = {
  ok:         (ctx, success) => ctx.json(success.body, STATUS_OK),
  created:    (ctx, success) => ctx.json(success.body, STATUS_CREATED),
  no_content: (ctx, _success) => new Response(null, { status: STATUS_NO_CONTENT }),
  stream:     (ctx, success) => new Response(success.stream as ReadableStream, { status: STATUS_OK, headers: { "Content-Type": NDJSON_CONTENT_TYPE } }),
};

const ERROR_HANDLERS: { [Kind in RouteError["kind"]]: ErrorHandler<Kind> } = {
  parse_request:    (ctx, error) => ctx.json({ error: error.message, field: error.field }, STATUS_BAD_REQUEST),
  validation_error: (ctx, error) => ctx.json({ error: error.message }, STATUS_UNPROCESSABLE),
  not_found:        (ctx, error) => ctx.json({ error: `Not found: ${error.resource}` }, STATUS_NOT_FOUND),
  internal:         (ctx, _error) => ctx.json({ error: "Internal server error" }, STATUS_INTERNAL_ERROR),
};

export function sendSuccess(ctx: Context, success: RouteSuccess): Response {
  // deno-lint-ignore no-explicit-any
  return SUCCESS_HANDLERS[success.kind](ctx, success as any);
}

export function sendError(ctx: Context, error: RouteError): Response {
  // deno-lint-ignore no-explicit-any
  return ERROR_HANDLERS[error.kind](ctx, error as any);
}
