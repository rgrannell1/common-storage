// Parameter parsing helpers for the cs http client

// Parses an array of "key=value" strings into a record; handles single string too
export function parseParams(rawParams: string | string[] | null): Record<string, string> {
  if (!rawParams) return {};
  const entries = Array.isArray(rawParams) ? rawParams : [rawParams];
  const result: Record<string, string> = {};
  for (const entry of entries) {
    const eqIdx = entry.indexOf("=");
    if (eqIdx === -1) continue;
    result[entry.slice(0, eqIdx)] = entry.slice(eqIdx + 1);
  }
  return result;
}

// Returns a required param value or throws if missing
export function requireParam(params: Record<string, string>, name: string): string {
  const value = params[name];
  if (value === undefined) {
    throw new Error(`Missing required param: -p ${name}=<value>`);
  }
  return value;
}

// Parses an optional integer param; throws if present but not a valid integer
export function parseOptionalInt(params: Record<string, string>, name: string): number | undefined {
  if (params[name] === undefined) return undefined;
  const parsed = Number(params[name]);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Invalid integer for param: -p ${name}=<integer>`);
  }
  return parsed;
}

// Parses a required integer param; throws if missing or not a valid integer
export function parseRequiredInt(params: Record<string, string>, name: string): number {
  const parsed = Number(requireParam(params, name));
  if (!Number.isInteger(parsed)) {
    throw new Error(`Invalid integer for param: -p ${name}=<integer>`);
  }
  return parsed;
}

// Parses a comma-separated list of integers; throws if any value is not a valid integer
export function parseIntList(params: Record<string, string>, name: string): number[] | undefined {
  if (params[name] === undefined) return undefined;
  return params[name].split(",").map((value, idx) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
      throw new Error(`Invalid integer at position ${idx + 1} for param: -p ${name}=<id>,...`);
    }
    return parsed;
  });
}

// Parses payload argument as JSON; throws if invalid
export function parsePayload(raw: string | null): unknown {
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Payload is not valid JSON");
  }
}
