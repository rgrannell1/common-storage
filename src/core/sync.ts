// Platform-agnostic sync cycle: diff → fetch ranges → write locally → tail.
// All platform dependencies (fetch, crypto.subtle) are Web standard APIs.
// Deno.* never appears here.

import type { ISyncBackend } from "../storage/backend.ts";
import type { EventEntry, ObjectEntry } from "../storage/capabilities.ts";
import { buildEventDiffRequest, buildObjectDiffRequest } from "./diff.ts";

// Discriminated change event emitted by watch() and returned by sync functions.
export type ChangeEvent =
  | { type: "upsert"; topic: string; entry: EventEntry | ObjectEntry }
  | { type: "delete"; topic: string; id: string };
import { DEFAULT_EVENT_BUCKET_SIZE, DEFAULT_OBJECT_BUCKET_SIZE, TAIL_DURATION_MS } from "../commons/constants.ts";
import { STATUS_NO_CONTENT } from "../api/commons/statuses.ts";

type DiffResponse =
  | { kind: "match" }
  | { kind: "diff"; ranges: { start: number; end: number }[] };

function authHeaders(token: string): Record<string, string> {
  return { "Authorization": `Bearer ${token}` };
}

async function postDiff(baseUrl: string, topic: string, token: string, body: unknown): Promise<DiffResponse> {
  const res = await fetch(`${baseUrl}/diff/${topic}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(body),
  });
  if (res.status === STATUS_NO_CONTENT) return { kind: "match" };
  if (!res.ok) throw new Error(`POST /diff/${topic} failed: ${res.status}`);
  const json = await res.json() as { ranges: { start: number; end: number }[] };
  return { kind: "diff", ranges: json.ranges };
}

async function fetchEventRange(baseUrl: string, topic: string, token: string, start: number, size: number): Promise<EventEntry[]> {
  const res = await fetch(`${baseUrl}/events/${topic}?start=${start}&size=${size}`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`GET /events/${topic} failed: ${res.status}`);
  const body = await res.json() as { entries: EventEntry[] };
  return body.entries ?? [];
}

async function fetchObjectRange(baseUrl: string, topic: string, token: string, start: number, size: number): Promise<ObjectEntry[]> {
  const res = await fetch(`${baseUrl}/objects/${topic}?start=${start}&size=${size}`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`GET /objects/${topic} failed: ${res.status}`);
  const body = await res.json() as { entries: ObjectEntry[] };
  return body.entries ?? [];
}

// Tails the remote NDJSON event stream briefly to catch writes that arrived during the diff round-trip.
async function tailEventStream(baseUrl: string, topic: string, token: string, startId: number, durationMs = TAIL_DURATION_MS): Promise<EventEntry[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), durationMs);
  const collected: EventEntry[] = [];
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
        if (line.trim()) collected.push(JSON.parse(line) as EventEntry);
      }
    }
  } catch (err) {
    if (!(err instanceof DOMException && err.name === "AbortError")) throw err;
  } finally {
    clearTimeout(timeout);
  }
  return collected;
}

// Applies a remote event entry locally and returns a ChangeEvent for emission.
async function applyEventEntry(backend: ISyncBackend, topic: string, entry: EventEntry): Promise<ChangeEvent> {
  await backend.events.updateEvent(topic, entry.id, entry.payload, { createdAt: entry.createdAt, updatedAt: entry.updatedAt });
  return { type: "upsert", topic, entry };
}

// Applies a remote object entry locally (routes tombstones to deleteObject) and returns a ChangeEvent.
// Remote seq and timestamps are preserved so local diff hashes match the server's.
async function applyObjectEntry(backend: ISyncBackend, topic: string, entry: ObjectEntry): Promise<ChangeEvent> {
  const timestamps = { seq: entry.seq, createdAt: entry.createdAt, updatedAt: entry.updatedAt };
  if (entry.payload === null) {
    await backend.objects.deleteObject(topic, entry.id, timestamps);
    return { type: "delete", topic, id: entry.id };
  }
  await backend.objects.upsertObject(topic, entry.id, entry.payload, timestamps);
  return { type: "upsert", topic, entry };
}

// Runs one full sync cycle for an event topic: diff → fetch divergent ranges → tail → write locally.
// Returns ChangeEvents for every entry written so the caller can emit them to watchers.
//
// NOTE: building the diff request requires a full scan of local events on every cycle. For topics
// with large entry counts this is O(n). TODO: persist bucket hashes in the cursor store to avoid
// the full re-scan.
export async function syncEventTopic(
  backend: ISyncBackend,
  baseUrl: string,
  token: string,
  topic: string,
  tailDurationMs?: number,
): Promise<ChangeEvent[]> {
  const cursor = await backend.cursors.getEventCursor(topic);
  const local = await backend.events.readEvents(topic, {}) ?? [];
  const changes: ChangeEvent[] = [];

  if (local.length === 0 && cursor === 0) {
    // Full fetch on first sync
    let start = 1;
    let maxId = 0;
    while (true) {
      const entries = await fetchEventRange(baseUrl, topic, token, start, DEFAULT_EVENT_BUCKET_SIZE);
      for (const entry of entries) {
        changes.push(await applyEventEntry(backend, topic, entry));
        maxId = Math.max(maxId, entry.id);
      }
      if (entries.length < DEFAULT_EVENT_BUCKET_SIZE) break;
      start = entries[entries.length - 1].id + 1;
    }
    // Tail catches writes that arrived on the remote during the bulk fetch window
    const tailed = await tailEventStream(baseUrl, topic, token, maxId + 1, tailDurationMs);
    for (const entry of tailed) {
      changes.push(await applyEventEntry(backend, topic, entry));
      maxId = Math.max(maxId, entry.id);
    }
    if (maxId > 0) await backend.cursors.setEventCursor(topic, maxId);
    return changes;
  }

  const diffReq = await buildEventDiffRequest(local);
  const result = await postDiff(baseUrl, topic, token, diffReq);
  if (result.kind === "match") return changes;

  let maxId = local.length > 0 ? local[local.length - 1].id : 0;
  for (const range of result.ranges) {
    const entries = await fetchEventRange(baseUrl, topic, token, range.start + 1, DEFAULT_EVENT_BUCKET_SIZE);
    for (const entry of entries) {
      changes.push(await applyEventEntry(backend, topic, entry));
      maxId = Math.max(maxId, entry.id);
    }
  }

  const tailed = await tailEventStream(baseUrl, topic, token, maxId + 1, tailDurationMs);
  for (const entry of tailed) {
    changes.push(await applyEventEntry(backend, topic, entry));
    maxId = Math.max(maxId, entry.id);
  }

  if (maxId > 0) await backend.cursors.setEventCursor(topic, maxId);
  return changes;
}

// Runs one full sync cycle for an object topic: diff → fetch divergent ranges → write locally.
// Returns ChangeEvents for every entry written so the caller can emit them to watchers.
export async function syncObjectTopic(
  backend: ISyncBackend,
  baseUrl: string,
  token: string,
  topic: string,
): Promise<ChangeEvent[]> {
  const local = await backend.objects.readObjectsBySeq(topic, {}) ?? [];
  const changes: ChangeEvent[] = [];

  if (local.length === 0) {
    let start = 1;
    let maxSeq = 0;
    while (true) {
      const entries = await fetchObjectRange(baseUrl, topic, token, start, DEFAULT_OBJECT_BUCKET_SIZE);
      for (const entry of entries) {
        changes.push(await applyObjectEntry(backend, topic, entry));
        maxSeq = Math.max(maxSeq, entry.seq);
      }
      if (entries.length < DEFAULT_OBJECT_BUCKET_SIZE) break;
      start = entries[entries.length - 1].seq + 1;
    }
    if (maxSeq > 0) await backend.cursors.setObjectCursor(topic, maxSeq);
    return changes;
  }

  const diffReq = await buildObjectDiffRequest(local);
  const result = await postDiff(baseUrl, topic, token, diffReq);
  if (result.kind === "match") return changes;

  let maxSeq = local.length > 0 ? local[local.length - 1].seq : 0;
  for (const range of result.ranges) {
    // range.start + 1: the bucket boundary is exclusive; fetch from one past the boundary
    const entries = await fetchObjectRange(baseUrl, topic, token, range.start + 1, DEFAULT_OBJECT_BUCKET_SIZE);
    for (const entry of entries) {
      changes.push(await applyObjectEntry(backend, topic, entry));
      maxSeq = Math.max(maxSeq, entry.seq);
    }
  }

  if (maxSeq > 0) await backend.cursors.setObjectCursor(topic, maxSeq);
  return changes;
}
