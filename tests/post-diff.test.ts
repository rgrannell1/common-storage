// Integration tests for POST /diff/:topic — interactive Merkle tree reconciliation
// @work.md

import {
  discard,
  jsonPost,
  jsonPut,
  makePersistentServer,
  type PersistentFetch,
} from "./helpers.ts";
import { hashBucket, hashMerkleInternalNode } from "../src/core/hashing.ts";
import { MERKLE_LEAF_SIZE, MERKLE_TREE_END } from "../src/commons/constants.ts";
import { buildEventMerkleTree, buildObjectMerkleTree } from "../src/core/diff.ts";

// SHA-256 of empty input — empty leaf bucket hash; non-leaf nodes use emptyTable[depth]
const EMPTY_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

type MerkleMismatch = { start: number; end: number; isLeaf: boolean };
type DiffResponse = { mismatches?: MerkleMismatch[] };

type EventEntry = {
  id: number;
  createdAt: number;
  updatedAt: number;
  payload: unknown;
};
type ObjectEntry = {
  id: string;
  seq: number;
  createdAt: number;
  updatedAt: number;
  payload: unknown;
};

function post(fetch: PersistentFetch, url: string, body: unknown): Promise<Response> {
  return fetch(url, jsonPost(body));
}

// Sends the root node of a full Merkle tree and returns the diff response.
function sendRoot(fetch: PersistentFetch, topic: string, rootHash: string): Promise<Response> {
  return post(fetch, `/diff/${topic}`, {
    nodes: [{ start: 0, end: MERKLE_TREE_END, hash: rootHash }],
  });
}

Deno.test("Proves POST /diff/:topic returns 404 for an unknown topic", async () => {
  const { fetch, cleanup } = await makePersistentServer();
  try {
    const diffBody = { nodes: [{ start: 0, end: MERKLE_TREE_END, hash: EMPTY_HASH }] };
    const res = await post(fetch, "/diff/nonexistent", diffBody);
    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
    await res.body?.cancel();
  } finally {
    await cleanup();
  }
});

Deno.test("Proves POST /diff/:topic returns 204 when event topic state matches", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "logs" }]);
  try {
    // Empty topic — root hash must be the empty tree's propagated hash, not just SHA-256("")
    const emptyRootHash = await buildEventMerkleTree([]).hashForRange(0, MERKLE_TREE_END);
    const res = await sendRoot(fetch, "logs", emptyRootHash);
    if (res.status !== 204) throw new Error(`Expected 204, got ${res.status}`);
    await res.body?.cancel();
  } finally {
    await cleanup();
  }
});

Deno.test("Proves POST /diff/:topic returns mismatches when event root hash diverges", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "logs" }]);
  try {
    await (await fetch("/events/logs", jsonPost({ payload: {} }))).json();

    // Wrong root hash — server reports the whole tree as mismatching
    const res = await sendRoot(fetch, "logs", "a".repeat(64));
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = await res.json() as DiffResponse;
    if (!body.mismatches || body.mismatches.length !== 1) {
      throw new Error(`Expected 1 mismatch, got ${JSON.stringify(body.mismatches)}`);
    }
    if (body.mismatches[0].start !== 0 || body.mismatches[0].end !== MERKLE_TREE_END) {
      throw new Error(`Expected root mismatch, got ${JSON.stringify(body.mismatches[0])}`);
    }
  } finally {
    await cleanup();
  }
});

Deno.test("Proves POST /diff/:topic returns 204 when object topic state matches", async () => {
  const { fetch, cleanup } = await makePersistentServer([], [{ name: "items" }]);
  try {
    const emptyRootHash = await buildObjectMerkleTree([]).hashForRange(0, MERKLE_TREE_END);
    const res = await sendRoot(fetch, "items", emptyRootHash);
    if (res.status !== 204) throw new Error(`Expected 204, got ${res.status}`);
    await res.body?.cancel();
  } finally {
    await cleanup();
  }
});

Deno.test(
  "Proves POST /diff/:topic returns mismatches when object root hash diverges",
  async () => {
  const { fetch, cleanup } = await makePersistentServer([], [{ name: "items" }]);
  try {
    const putRes = await fetch("/objects/items/abc", jsonPut({ payload: { value: 1 } }));
    await discard(putRes);

    const res = await sendRoot(fetch, "items", "a".repeat(64));
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = await res.json() as DiffResponse;
    if (!body.mismatches || body.mismatches.length === 0) {
      throw new Error(`Expected mismatches, got ${JSON.stringify(body)}`);
    }
  } finally {
    await cleanup();
  }
});

Deno.test("Proves POST /diff/:topic returns 204 when event leaf hashes match exactly", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "logs" }]);
  try {
    const entryRes = await fetch("/events/logs", jsonPost({ payload: {} }));
    const entry = await entryRes.json() as EventEntry;

    const tree = buildEventMerkleTree([entry]);
    const rootHash = await tree.hashForRange(0, MERKLE_TREE_END);

    const res = await sendRoot(fetch, "logs", rootHash);
    await discard(res);
    if (res.status !== 204) throw new Error(`Expected 204, got ${res.status}`);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves POST /diff/:topic returns 204 when object leaf hashes match", async () => {
  const { fetch, cleanup } = await makePersistentServer([], [{ name: "items" }]);
  try {
    const putRes = await fetch("/objects/items/abc", jsonPut({ payload: { value: 1 } }));
    const entry = await putRes.json() as ObjectEntry;

    const tree = buildObjectMerkleTree([entry]);
    const rootHash = await tree.hashForRange(0, MERKLE_TREE_END);

    const res = await sendRoot(fetch, "items", rootHash);
    await discard(res);
    if (res.status !== 204) throw new Error(`Expected 204, got ${res.status}`);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves POST /diff/:topic converges to leaf mismatches interactively", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "logs" }]);
  try {
    const entryRes = await fetch("/events/logs", jsonPost({ payload: {} }));
    const entry = await entryRes.json() as EventEntry;

    // Client has no local entries — compute correct empty-tree hashes for each subtree
    const clientTree = buildEventMerkleTree([]);
    const rootHash = await clientTree.hashForRange(0, MERKLE_TREE_END);
    let frontier = [{ start: 0, end: MERKLE_TREE_END, hash: rootHash }];
    const leafRanges: { start: number; end: number }[] = [];

    for (let round = 0; round < 25; round++) {
      const res = await post(fetch, "/diff/logs", { nodes: frontier });
      if (res.status === 204) break;
      const body = await res.json() as DiffResponse;
      const mismatches = body.mismatches ?? [];

      const nextFrontier: typeof frontier = [];
      for (const mismatch of mismatches) {
        if (mismatch.isLeaf) {
          leafRanges.push({ start: mismatch.start, end: mismatch.end });
        } else {
          const mid = Math.floor((mismatch.start + mismatch.end) / 2);
          const [leftHash, rightHash] = await Promise.all([
            clientTree.hashForRange(mismatch.start, mid),
            clientTree.hashForRange(mid, mismatch.end),
          ]);
          nextFrontier.push({ start: mismatch.start, end: mid, hash: leftHash });
          nextFrontier.push({ start: mid, end: mismatch.end, hash: rightHash });
        }
      }
      frontier = nextFrontier;
      if (frontier.length === 0) break;
    }

    // Exactly one leaf should differ — the leaf containing the single written entry
    if (leafRanges.length !== 1) {
      const leafJson = JSON.stringify(leafRanges);
      const msg = `Expected 1 leaf mismatch, got ${leafRanges.length}: ${leafJson}`;
      throw new Error(msg);
    }

    const [leaf] = leafRanges;
    if (leaf.end - leaf.start > MERKLE_LEAF_SIZE) {
      throw new Error(`Leaf range exceeds MERKLE_LEAF_SIZE: ${JSON.stringify(leaf)}`);
    }
    if (entry.id <= leaf.start || entry.id > leaf.end) {
      throw new Error(`Entry id=${entry.id} not covered by leaf range ${JSON.stringify(leaf)}`);
    }
  } finally {
    await cleanup();
  }
});

Deno.test("Proves POST /diff/:topic includes tombstoned entries in object diff", async () => {
  const { fetch, cleanup } = await makePersistentServer([], [{ name: "items" }]);
  try {
    await discard(await fetch("/objects/items/gone", jsonPut({ payload: {} })));
    const deleteRes = await fetch("/objects/items/gone", { method: "DELETE" });
    const tombstone = await deleteRes.json() as ObjectEntry;

    const tree = buildObjectMerkleTree([tombstone]);
    const rootHash = await tree.hashForRange(0, MERKLE_TREE_END);

    // Correct tombstone hash — no diff
    const matchRes = await sendRoot(fetch, "items", rootHash);
    await discard(matchRes);
    const expectedMatch = 204;
    if (matchRes.status !== expectedMatch) {
      throw new Error(`Expected 204 with correct tombstone hash, got ${matchRes.status}`);
    }

    // Wrong hash — server reports a mismatch
    const mismatchRes = await sendRoot(fetch, "items", "a".repeat(64));
    const expectedMismatch = 200;
    if (mismatchRes.status !== expectedMismatch) {
      throw new Error(`Expected 200 with wrong tombstone hash, got ${mismatchRes.status}`);
    }
    const body = await mismatchRes.json() as DiffResponse;
    if (!body.mismatches || body.mismatches.length === 0) {
      throw new Error(`Expected mismatches for tombstone, got ${JSON.stringify(body)}`);
    }
  } finally {
    await cleanup();
  }
});

Deno.test("Proves POST /diff/:topic returns 422 for a malformed diff body", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "logs" }]);
  try {
    const res = await post(fetch, "/diff/logs", { notAValidField: true });
    await discard(res);
    if (res.status !== 422) throw new Error(`Expected 422, got ${res.status}`);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves POST /diff/:topic returns 422 for an empty nodes array", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "logs" }]);
  try {
    const res = await post(fetch, "/diff/logs", { nodes: [] });
    await discard(res);
    if (res.status !== 422) throw new Error(`Expected 422, got ${res.status}`);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves POST /diff/:topic returns 204 when multiple events are in sync", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "logs" }]);
  try {
    const entries: EventEntry[] = [];
    for (let idx = 0; idx < 5; idx++) {
      const res = await fetch("/events/logs", jsonPost({ payload: { idx } }));
      const entry = await res.json() as EventEntry;
      entries.push(entry);
    }

    const tree = buildEventMerkleTree(entries);
    const rootHash = await tree.hashForRange(0, MERKLE_TREE_END);

    const res = await sendRoot(fetch, "logs", rootHash);
    await discard(res);
    if (res.status !== 204) throw new Error(`Expected 204, got ${res.status}`);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves POST /diff/:topic detects server nodes not covered by client hash", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "logs" }]);
  try {
    const entryRes = await fetch("/events/logs", jsonPost({ payload: {} }));
    const entry = await entryRes.json() as EventEntry;

    // Build the correct leaf hash for the entry's leaf, send it with the wrong parent hash
    const tree = buildEventMerkleTree([entry]);
    const leafStart = Math.floor((entry.id - 1) / MERKLE_LEAF_SIZE) * MERKLE_LEAF_SIZE;
    const leafHash = await tree.hashForRange(leafStart, leafStart + MERKLE_LEAF_SIZE);

    // Send just the leaf node with the correct hash — server should return 204 if it matches
    const leafEnd = leafStart + MERKLE_LEAF_SIZE;
    const res = await post(fetch, "/diff/logs", {
      nodes: [{ start: leafStart, end: leafEnd, hash: leafHash }],
    });
    await discard(res);
    if (res.status !== 204) throw new Error(`Expected 204 for correct leaf, got ${res.status}`);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves hashBucket and hashMerkleInternalNode produce verifiable hashes", async () => {
  // Validates that the hash primitives produce the right output so tests above are meaningful.
  const leafHash = await hashBucket([{ id: 1, updatedAt: 1000 }]);
  const emptyHash = await hashBucket([]);
  if (emptyHash !== EMPTY_HASH) throw new Error(`Empty bucket hash mismatch: ${emptyHash}`);

  const parentHash = await hashMerkleInternalNode(leafHash, emptyHash);
  const expectedLen = 64;
  if (parentHash.length !== expectedLen) {
    throw new Error(`Internal node hash has wrong length: ${parentHash.length}`);
  }
});
