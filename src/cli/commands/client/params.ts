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

// Returns a required param value or exits with an error
export function requireParam(params: Record<string, string>, name: string): string {
  const value = params[name];
  if (value === undefined) {
    console.error(`Missing required param: -p ${name}=<value>`);
    Deno.exit(1);
  }
  return value;
}

// Parses payload argument as JSON; exits with error if invalid
export function parsePayload(raw: string | null): unknown {
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    console.error("Payload is not valid JSON");
    Deno.exit(1);
  }
}
