// Request and response parser combinators — reusable primitives for building route parsers

import { z } from "zod";
import { ok, err, type Result } from "../../commons/types/result.ts";
import type { RequestParts, ResponseParser } from "../../commons/types/parser.ts";
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
export function responseParser<SchemaOutput>(schema: z.ZodType<SchemaOutput>): ResponseParser<RouteSuccess, RouteError> {
  return (value: unknown): Result<RouteSuccess, RouteError> => {
    const parsed = schema.safeParse(value);

    if (!parsed.success) {
      return err({ kind: "internal", message: parsed.error.message });
    }

    return ok({ kind: "ok", body: parsed.data });
  };
}
