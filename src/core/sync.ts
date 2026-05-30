// Platform-agnostic sync cycle: Merkle diff → fetch ranges → write locally → tail.
// All platform dependencies (fetch, crypto.subtle) are Web standard APIs.
// Deno.* never appears here.

import type { ISyncBackend } from "../storage/backend.ts";
import type { EventEntry, MerkleMismatch, ObjectEntry } from "../storage/capabilities.ts";
import { buildEventMerkleTree, buildObjectMerkleTree, type IMerkleTree } from "./diff.ts";
import {
  DEFAULT_FETCH_PAGE_SIZE,
  TAIL_DURATION_MS,
  MERKLE_TREE_END,
  MERKLE_LEAF_SIZE,
} from "../commons/constants.ts";
import { STATUS_NO_CONTENT } from "../api/commons/statuses.ts";

// Discriminated change event emitted by watch() and returned by sync functions.
export type ChangeEvent =
  | { type: "upsert"; topic: string; entry: EventEntry | ObjectEntry }
  | { type: "delete"; topic: string; id: string };

type DiffRoundResponse =
  | { kind: "match" }
  | { kind: "diff"; mismatches: { start: number; end: number; isLeaf: boolean }[] };

export type SyncProgressEvent =
  | { phase: "diff";  round: number }
  | { phase: "fetch"; count: number };

type MerkleRangeResult = { start: number; end: number }[];

function authHeaders(token: string): Record<string, string> {
  return { "Authorization": `Bearer ${token}` };
}

async function postDiffRound(
  baseUrl: string,
  topic: string,
  token: string,
  nodes: { start: number; end: number; hash: string }[],
): Promise<DiffRoundResponse> {
  const res = await fetch(`${baseUrl}/diff/${topic}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify({ nodes }),
  });
  if (res.status === STATUS_NO_CONTENT) return { kind: "match" };
  if (!res.ok) throw new Error(`POST /diff/${topic} failed: ${res.status}`);
  type DiffResponse = { mismatches: MerkleMismatch[] };
  const json = await res.json() as DiffResponse;
  return { kind: "diff", mismatches: json.mismatches };
}

// Runs the interactive Merkle diff loop: sends the root, bisects mismatching non-leaf nodes,
// and collects leaf ranges that need to be fetched.
async function merkleDiff(
  baseUrl: string,
  topic: string,
  token: string,
  tree: IMerkleTree,
  onProgress?: (event: SyncProgressEvent) => void,
): Promise<MerkleRangeResult> {
  const rootHash = await tree.hashForRange(0, MERKLE_TREE_END);
  let frontier = [{ start: 0, end: MERKLE_TREE_END, hash: rootHash }];
  const leafRanges: { start: number; end: number }[] = [];
  let round = 0;

  while (frontier.length > 0) {
    round++;
    onProgress?.({ phase: "diff", round });
    const response = await postDiffRound(baseUrl, topic, token, frontier);
    if (response.kind === "match") break;

    const nextFrontier: typeof frontier = [];
    for (const mismatch of response.mismatches) {
      if (mismatch.isLeaf) {
        leafRanges.push({ start: mismatch.start, end: mismatch.end });
      } else {
        const mid = Math.floor((mismatch.start + mismatch.end) / 2);
        const [leftHash, rightHash] = await Promise.all([
          tree.hashForRange(mismatch.start, mid),
          tree.hashForRange(mid, mismatch.end),
        ]);
        nextFrontier.push({ start: mismatch.start, end: mid, hash: leftHash });
        nextFrontier.push({ start: mid, end: mismatch.end, hash: rightHash });
      }
    }
    frontier = nextFrontier;
  }

  return leafRanges;
}

async function fetchEventRange(
  baseUrl: string,
  topic: string,
  token: string,
  start: number,
  size: number,
): Promise<EventEntry[]> {
  const url = `${baseUrl}/events/${topic}?start=${start}&size=${size}`;
  const res = await fetch(url, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`GET /events/${topic} failed: ${res.status}`);
  const body = await res.json() as { entries: EventEntry[] };
  return body.entries ?? [];
}

async function fetchObjectRange(
  baseUrl: string,
  topic: string,
  token: string,
  start: number,
  size: number,
): Promise<ObjectEntry[]> {
  const url = `${baseUrl}/objects/${topic}?start=${start}&size=${size}`;
  const res = await fetch(url, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`GET /objects/${topic} failed: ${res.status}`);
  const body = await res.json() as { entries: ObjectEntry[] };
  return body.entries ?? [];
}

// Tails the remote NDJSON stream briefly to catch writes during the diff round-trip.
async function tailEventStream(
  baseUrl: string,
  topic: string,
  token: string,
  startId: number,
  durationMs = TAIL_DURATION_MS,
): Promise<EventEntry[]> {
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
// skipMerkle skips cache invalidation — used during first sync where no cache exists yet.
async function applyEventEntry(
  backend: ISyncBackend,
  topic: string,
  entry: EventEntry,
  skipMerkle = false,
): Promise<ChangeEvent> {
  const timestamps = { createdAt: entry.createdAt, updatedAt: entry.updatedAt };
  await backend.events.updateEvent(topic, entry.id, entry.payload, timestamps);
  if (!skipMerkle) await backend.merkleEvents?.invalidatePath(topic, entry.id);
  return { type: "upsert", topic, entry };
}

// Applies a remote object entry locally (routes tombstones to deleteObject).
// Remote seq and timestamps are preserved so local diff hashes match the server's.
// skipMerkle skips cache invalidation — used during first sync where no cache exists yet.
async function applyObjectEntry(
  backend: ISyncBackend,
  topic: string,
  entry: ObjectEntry,
  skipMerkle = false,
): Promise<ChangeEvent> {
  const readCached = (!skipMerkle && backend.merkleObjects);
  const existing = readCached ? await backend.objects.readObject(topic, entry.id) : undefined;
  const oldSeq = existing?.seq;
  const timestamps = {
    seq: entry.seq,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
  if (entry.payload === null) {
    await backend.objects.deleteObject(topic, entry.id, timestamps);
  } else {
    await backend.objects.upsertObject(topic, entry.id, entry.payload, timestamps);
  }
  if (!skipMerkle) await backend.merkleObjects?.invalidatePaths(topic, entry.seq, oldSeq);
  if (entry.payload === null) return { type: "delete", topic, id: entry.id };
  return { type: "upsert", topic, entry };
}

// Runs one sync cycle for an event topic: Merkle diff → fetch ranges → tail → write locally.
// Returns ChangeEvents for every entry written so the caller can emit them to watchers.
export async function syncEventTopic(
  backend: ISyncBackend,
  baseUrl: string,
  token: string,
  topic: string,
  tailDurationMs?: number,
  onProgress?: (event: SyncProgressEvent) => void,
): Promise<ChangeEvent[]> {
  const cursor = await backend.cursors.getEventCursor(topic);
  const changes: ChangeEvent[] = [];

  if (cursor === 0) {
    // Full fetch on first sync — avoids Merkle traversal overhead when local state is empty.
    // skipMerkle=true: no cache exists yet so invalidation is pure overhead.
    let start = 1;
    let maxId = 0;
    while (true) {
      const entries = await fetchEventRange(baseUrl, topic, token, start, DEFAULT_FETCH_PAGE_SIZE);
      for (const entry of entries) {
        changes.push(await applyEventEntry(backend, topic, entry, true));
        maxId = Math.max(maxId, entry.id);
        onProgress?.({ phase: "fetch", count: changes.length });
      }
      if (entries.length < DEFAULT_FETCH_PAGE_SIZE) break;
      start = entries[entries.length - 1].id + 1;
    }
    // Tail catches writes that arrived on the remote during the bulk fetch window
    const tailed = await tailEventStream(baseUrl, topic, token, maxId + 1, tailDurationMs);
    for (const entry of tailed) {
      changes.push(await applyEventEntry(backend, topic, entry, true));
      maxId = Math.max(maxId, entry.id);
    }
    if (maxId > 0) await backend.cursors.setEventCursor(topic, maxId);
    return changes;
  }

  // Use IDB Merkle cache when available; fall back to loading all local entries.
  const tree: IMerkleTree = backend.merkleEvents
    ? backend.merkleEvents.forTopic(topic)
    : buildEventMerkleTree(await backend.events.readEvents(topic, {}) ?? []);
  const leafRanges = await merkleDiff(baseUrl, topic, token, tree, onProgress);

  if (leafRanges.length === 0) return changes;

  let maxId = cursor;
  for (const range of leafRanges) {
    // range.start is the exclusive lower bound; fetch from start+1
    const entries = await fetchEventRange(baseUrl, topic, token, range.start + 1, MERKLE_LEAF_SIZE);
    for (const entry of entries) {
      changes.push(await applyEventEntry(backend, topic, entry));
      maxId = Math.max(maxId, entry.id);
      onProgress?.({ phase: "fetch", count: changes.length });
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

// Runs one sync cycle for an object topic: Merkle diff → fetch ranges → write locally.
// Returns ChangeEvents for every entry written so the caller can emit them to watchers.
export async function syncObjectTopic(
  backend: ISyncBackend,
  baseUrl: string,
  token: string,
  topic: string,
): Promise<ChangeEvent[]> {
  const cursor = await backend.cursors.getObjectCursor(topic);
  const changes: ChangeEvent[] = [];

  if (cursor === 0) {
    // Full fetch on first sync — avoids Merkle traversal overhead when local state is empty.
    // skipMerkle=true: no cache exists yet so invalidation is pure overhead.
    let start = 1;
    let maxSeq = 0;
    while (true) {
      const entries = await fetchObjectRange(baseUrl, topic, token, start, DEFAULT_FETCH_PAGE_SIZE);
      for (const entry of entries) {
        changes.push(await applyObjectEntry(backend, topic, entry, true));
        maxSeq = Math.max(maxSeq, entry.seq);
      }
      if (entries.length < DEFAULT_FETCH_PAGE_SIZE) break;
      start = entries[entries.length - 1].seq + 1;
    }
    if (maxSeq > 0) await backend.cursors.setObjectCursor(topic, maxSeq);
    return changes;
  }

  // Use IDB Merkle cache when available; fall back to loading all local entries.
  const tree: IMerkleTree = backend.merkleObjects
    ? backend.merkleObjects.forTopic(topic)
    : buildObjectMerkleTree(await backend.objects.readObjectsBySeq(topic, {}) ?? []);
  const leafRanges = await merkleDiff(baseUrl, topic, token, tree);

  if (leafRanges.length === 0) return changes;

  let maxSeq = cursor;
  for (const range of leafRanges) {
    // range.start is the exclusive lower bound; fetch from start+1
    const entries = await fetchObjectRange(
      baseUrl,
      topic,
      token,
      range.start + 1,
      MERKLE_LEAF_SIZE,
    );
    for (const entry of entries) {
      changes.push(await applyObjectEntry(backend, topic, entry));
      maxSeq = Math.max(maxSeq, entry.seq);
    }
  }

  if (maxSeq > 0) await backend.cursors.setObjectCursor(topic, maxSeq);
  return changes;
}
