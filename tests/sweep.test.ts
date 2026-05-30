// Integration tests for sweepTombstones — verifies that swept entries are removed from the
// seq index and that Merkle hash caches are invalidated so subsequent diffs recompute correctly.
// @work.md

import { DenoKVBackend } from "../src/storage/kv/index.ts";
import { buildObjectMerkleTree } from "../src/core/diff.ts";
import { MERKLE_TREE_END } from "../src/commons/constants.ts";

async function makeStorage(): Promise<{ storage: DenoKVBackend; tmpPath: string }> {
  const tmpPath = await Deno.makeTempFile({ suffix: ".db" });
  const storage = new DenoKVBackend(tmpPath);
  await storage.init();
  await storage.createTopics([], [{ name: "things" }]);
  return { storage, tmpPath };
}

Deno.test("Proves sweepTombstones removes the primary and seq index entries", async () => {
  const { storage, tmpPath } = await makeStorage();
  try {
    await storage.upsertObject("things", "a", { value: 1 });
    await storage.deleteObject("things", "a");

    await storage.sweepTombstones("things", Date.now() + 1);

    const gone = await storage.readObject("things", "a");
    if (gone !== null) throw new Error(`Expected null after sweep, got ${JSON.stringify(gone)}`);
  } finally {
    await storage.close();
    await Deno.remove(tmpPath);
  }
});

Deno.test(
  "Proves sweepTombstones invalidates Merkle hash cache so subsequent diff recomputes",
  async () => {
  const { storage, tmpPath } = await makeStorage();
  try {
    await storage.upsertObject("things", "a", { value: 1 });
    const tombstone = await storage.deleteObject("things", "a");
    if (!tombstone) throw new Error("Expected tombstone");

    // Build a client Merkle tree that includes the tombstone
    const tree = buildObjectMerkleTree([tombstone]);
    const rootHash = await tree.hashForRange(0, MERKLE_TREE_END);
    const diffReq = { nodes: [{ start: 0, end: MERKLE_TREE_END, hash: rootHash }] };

    // Before sweep: diff should match — server also has the tombstone
    const before = await storage.diffObjects("things", diffReq);
    if (before?.kind !== "match") {
      const beforeResult = JSON.stringify(before);
      throw new Error(`Expected match before sweep, got ${beforeResult}`);
    }

    // Sweep with a future cutoff — removes the tombstone and invalidates the Merkle cache
    await storage.sweepTombstones("things", Date.now() + 1);

    // After sweep: same request now mismatches — server's leaf is empty, client's hash
    // still includes tombstone
    const after = await storage.diffObjects("things", diffReq);
    const afterResult = JSON.stringify(after);
    if (after?.kind !== "diff") throw new Error(`Expected diff after sweep, got ${afterResult}`);
  } finally {
    await storage.close();
    await Deno.remove(tmpPath);
  }
});

Deno.test("Proves sweepTombstones does not sweep entries within the retention window", async () => {
  const { storage, tmpPath } = await makeStorage();
  try {
    await storage.upsertObject("things", "b", { value: 2 });
    await storage.deleteObject("things", "b");

    // Cutoff is in the past — nothing should be swept
    await storage.sweepTombstones("things", Date.now() - 1_000);

    const stillThere = await storage.readObject("things", "b");
    if (!stillThere) throw new Error("Expected tombstone to remain within retention window");
    if (stillThere.payload !== null) {
      const stillTherePayload = JSON.stringify(stillThere.payload);
      throw new Error(`Expected tombstone payload, got ${stillTherePayload}`);
    }
  } finally {
    await storage.close();
    await Deno.remove(tmpPath);
  }
});

Deno.test("Proves sweepTombstones does not sweep a resurrected entry", async () => {
  const { storage, tmpPath } = await makeStorage();
  try {
    await storage.upsertObject("things", "c", { value: 3 });
    await storage.deleteObject("things", "c");
    // Resurrect before sweep
    await storage.upsertObject("things", "c", { value: 4 });

    await storage.sweepTombstones("things", Date.now() + 1);

    const alive = await storage.readObject("things", "c");
    if (!alive) throw new Error("Expected resurrected entry to survive sweep");
    if (alive.payload === null) throw new Error("Resurrected entry should not be a tombstone");
  } finally {
    await storage.close();
    await Deno.remove(tmpPath);
  }
});
