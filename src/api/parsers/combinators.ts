// Request and response parser combinators — reusable primitives for building route parsers

import { z } from "zod";
import { ok, err, type Result } from "../../commons/types/result.ts";
import type { RequestParts, RequestParser, ResponseParser } from "../../commons/types/parser.ts";
import type { RouteError, RouteSuccess } from "../../commons/types/responses.ts";

// Builds a RequestParser that extracts query params from the URL matching the schema's shape.
// Boolean fields are read as flags (present = true, absent = false); all others as strings.
export function queryParser<S extends z.ZodRawShape>(schema: z.ZodObject<S>) {
  return (parts: RequestParts<unknown>): Result<z.infer<z.ZodObject<S>>, RouteError> => {
    const raw: Record<string, unknown> = {};

    for (const [key, fieldSchema] of Object.entries(schema.shape)) {
      if (fieldSchema instanceof z.ZodBoolean) {
        raw[key] = parts.url.searchParams.has(key);
      } else {
        const value = parts.url.searchParams.get(key);
        if (value !== null) {
          raw[key] = value;
        }
      }
    }

    const parsed = schema.safeParse(raw);

    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return err({
        kind: "parse_request",
        field: firstError?.path.join(".") ?? "unknown",
        message: parsed.error.message,
      });
    }

    return ok(parsed.data);
  };
}

// Builds a ResponseParser that validates the outbound value against a schema and wraps it in RouteSuccess.
// kind defaults to "ok"; pass "created" for 201 responses.
export function responseParser<SchemaOutput>(schema: z.ZodType<SchemaOutput>, kind: "ok" | "created" = "ok"): ResponseParser<RouteSuccess, RouteError> {
  return (value: unknown): Result<RouteSuccess, RouteError> => {
    const parsed = schema.safeParse(value);

    if (!parsed.success) {
      return err({ kind: "internal", message: parsed.error.message });
    }

    return ok({ kind, body: parsed.data });
  };
}

// Builds a RequestParser that reads and validates path parameters against a schema's shape.
export function pathParamParser<SchemaShape extends z.ZodRawShape>(schema: z.ZodObject<SchemaShape>) {
  return (parts: RequestParts<unknown>): Result<z.infer<z.ZodObject<SchemaShape>>, RouteError> => {
    const parsed = schema.safeParse(parts.params);

    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return err({
        kind: "parse_request",
        field: firstError?.path.join(".") ?? "unknown",
        message: parsed.error.message,
      });
    }

    return ok(parsed.data);
  };
}

// Builds a RequestParser that reads and validates the request body against a schema.
export function bodyParser<SchemaOutput>(schema: z.ZodType<SchemaOutput>) {
  return (parts: RequestParts<unknown>): Result<SchemaOutput, RouteError> => {
    const parsed = schema.safeParse(parts.body);

    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return err({
        kind: "parse_request",
        field: firstError?.path.join(".") ?? "unknown",
        message: parsed.error.message,
      });
    }

    return ok(parsed.data);
  };
}

// Extracts the Idempotency-Key header as an optional string.
export function idempotencyKeyParser() {
  return (parts: RequestParts<unknown>): Result<{ idempotencyKey: string | undefined }, RouteError> => {
    return ok({ idempotencyKey: parts.headers.get("Idempotency-Key") ?? undefined });
  };
}

// Merges two RequestParsers, running both and intersecting their output types.
// Returns the first error encountered if either parser fails.
export function mergeParser<ParsedA, ParsedB>(
  parserA: RequestParser<ParsedA, unknown, RouteError>,
  parserB: RequestParser<ParsedB, unknown, RouteError>,
): RequestParser<ParsedA & ParsedB, unknown, RouteError> {
  return (parts: RequestParts<unknown>): Result<ParsedA & ParsedB, RouteError> => {
    const resultA = parserA(parts);
    if (!resultA.ok) return resultA;

    const resultB = parserB(parts);
    if (!resultB.ok) return resultB;

    return ok({ ...resultA.value, ...resultB.value });
  };
}

// Merges three RequestParsers into one, intersecting their output types in order.
export function mergeAll<ParsedA, ParsedB, ParsedC>(
  parserA: RequestParser<ParsedA, unknown, RouteError>,
  parserB: RequestParser<ParsedB, unknown, RouteError>,
  parserC: RequestParser<ParsedC, unknown, RouteError>,
): RequestParser<ParsedA & ParsedB & ParsedC, unknown, RouteError>;

// Merges two RequestParsers into one, intersecting their output types.
export function mergeAll<ParsedA, ParsedB>(
  parserA: RequestParser<ParsedA, unknown, RouteError>,
  parserB: RequestParser<ParsedB, unknown, RouteError>,
): RequestParser<ParsedA & ParsedB, unknown, RouteError>;

export function mergeAll(
  // deno-lint-ignore no-explicit-any
  ...parsers: Array<RequestParser<any, unknown, RouteError>>
  // deno-lint-ignore no-explicit-any
): RequestParser<any, unknown, RouteError> {
  return parsers.reduce(mergeParser);
}
