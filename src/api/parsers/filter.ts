// JMESPath filter evaluation for entry payloads; used by GET /events/:topic and GET /objects/:topic
// @work.md

import jmespath from "jmespath";
import { ok, err, type Result } from "../../commons/types/result.ts";
import type { RouteError } from "../../commons/types/responses.ts";

type Entry = { payload: unknown };

const FALSY_VALUES = new Set([false, null, 0, "", undefined]);

function isFalsy(value: unknown): boolean {
  if (FALSY_VALUES.has(value as never)) return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

function matchesFilter(expr: string, entry: Entry): boolean {
  const result = jmespath.search(entry.payload, expr);
  return !isFalsy(result);
}

export function applyFilter<EntryType extends Entry>(entries: EntryType[], expr: string): Result<EntryType[], RouteError> {
  try {
    return ok(entries.filter(matchesFilter.bind(null, expr)));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return err({ kind: "validation_error", message: `Invalid filter expression: ${message}` });
  }
}
