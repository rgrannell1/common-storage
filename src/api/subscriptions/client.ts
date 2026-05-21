// HTTP client for talking to a remote common-storage server during subscription sync.
// All functions are stateless; callers supply the base URL and token on each call.

import type { EventEntry, EventDiffRequest } from "../storage/capabilities.ts";

// Duration of the post-diff NDJSON tail to catch writes that arrived during the diff round-trip
const TAIL_DURATION_MS = 5_000;

type DiffResponse =
  | { kind: "match" }
  | { kind: "diff"; ranges: { start: number; end: number }[] };

function authHeaders(token: string): Record<string, string> {
  return { "Authorization": `Bearer ${token}` };
}

export async function postDiff(baseUrl: string, topic: string, token: string, req: EventDiffRequest): Promise<DiffResponse> {
  const res = await fetch(`${baseUrl}/diff/${topic}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(req),
  });

  if (res.status === 204) return { kind: "match" };

  const body = await res.json() as { ranges: { start: number; end: number }[] };
  return { kind: "diff", ranges: body.ranges };
}

export async function fetchRange(baseUrl: string, topic: string, token: string, start: number, size: number): Promise<EventEntry[]> {
  const res = await fetch(`${baseUrl}/events/${topic}?start=${start}&size=${size}`, {
    headers: authHeaders(token),
  });
  const body = await res.json() as { entries: EventEntry[] };
  return body.entries ?? [];
}

// Tails the remote NDJSON stream for up to TAIL_DURATION_MS, collecting entries that arrive after startId.
export async function tailEvents(baseUrl: string, topic: string, token: string, startId: number): Promise<EventEntry[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TAIL_DURATION_MS);

  const entries: EventEntry[] = [];
  try {
    const res = await fetch(`${baseUrl}/events/${topic}?start=${startId}`, {
      headers: { ...authHeaders(token), "Accept": "application/x-ndjson" },
      signal: controller.signal,
    });

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) entries.push(JSON.parse(line) as EventEntry);
      }
    }
  } catch {
    // AbortError on timeout is expected; swallow it and return what we collected
  } finally {
    clearTimeout(timeout);
  }

  return entries;
}
