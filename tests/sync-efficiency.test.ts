// Proves sync is bucket-efficient for large event and object topics.
// Uses CommonStorageNode as the client, a real persistent HTTP server, and the full service stack.
// @work.md

import { assertEquals, assertLess } from "@std/assert";
import { DenoKVBackend, KvOpsCounter } from "../src/storage/kv/index.ts";
import { CommonStorageNode } from "../src/core/node.ts";
import type { IScheduler } from "../src/core/node.ts";
import { createApp } from "../src/api/app.ts";
import { MetricsCollector } from "../src/api/metrics/collector.ts";
import { buildSchemaRegistry } from "../src/api/parsers/payload-schema.ts";
import { NoopLogger } from "../src/commons/logger.ts";
import { TEST_TOKEN, TEST_ROOT_KEY_VAR } from "./helpers.ts";
import type { Config } from "../src/commons/config.ts";

const EVENT_TOPIC = "sync-eff-events";
const OBJECT_TOPIC = "sync-eff-objects";

// Short tail — avoids the 5 s production timeout in each sync cycle
const TEST_TAIL_MS = 100;

const INITIAL_COUNT = 2_000;
const INCREMENTAL_COUNT = 1_000;

// No-op scheduler: sync is driven manually via node.sync()
const NO_OP_SCHEDULER: IScheduler = {
  schedule: () => {},
  cancelAll: () => {},
};

// Writes entries in parallel batches; writeEvent is atomic-checked so concurrent calls retry safely.
async function writeBatch(fn: (idx: number) => Promise<unknown>, count: number, batchSize = 20): Promise<void> {
  for (let idx = 0; idx < count; idx += batchSize) {
    const end = Math.min(idx + batchSize, count);
    await Promise.all(Array.from({ length: end - idx }, (_, jdx) => fn(idx + jdx)));
  }
}

Deno.test("Proves sync is bucket-efficient — incremental and deletion cycles read proportionally to changed buckets, not total entries", async () => {
  // --- Server setup ---
  const serverTmpPath = await Deno.makeTempFile({ suffix: ".db" });
  const serverOps = new KvOpsCounter();
  const serverStorage = new DenoKVBackend(serverTmpPath, serverOps);
  await serverStorage.init();
  await serverStorage.createTopics([{ name: EVENT_TOPIC }], [{ name: OBJECT_TOPIC }]);

  const schemas = await buildSchemaRegistry([{ name: EVENT_TOPIC }], [{ name: OBJECT_TOPIC }]);
  const config: Config = { server: { port: 0 }, rootKey: TEST_ROOT_KEY_VAR };
  const app = createApp({
    storage: serverStorage,
    collector: new MetricsCollector(serverStorage),
    config,
    schemas,
    logger: new NoopLogger(),
  });
  const server = Deno.serve({ port: 0 }, app.fetch);
  const baseUrl = `http://localhost:${server.addr.port}`;

  // --- Client setup ---
  const clientTmpPath = await Deno.makeTempFile({ suffix: ".db" });
  const clientStorage = new DenoKVBackend(clientTmpPath);
  await clientStorage.init();
  await clientStorage.createTopics([{ name: EVENT_TOPIC }], [{ name: OBJECT_TOPIC }]);

  const node = new CommonStorageNode(
    { backend: clientStorage, scheduler: NO_OP_SCHEDULER, logger: new NoopLogger() },
    {
      events: [{ topic: EVENT_TOPIC, remoteUrl: baseUrl, token: TEST_TOKEN, intervalMs: 60_000, tailDurationMs: TEST_TAIL_MS }],
      objects: [{ topic: OBJECT_TOPIC, remoteUrl: baseUrl, token: TEST_TOKEN, intervalMs: 60_000 }],
    },
  );

  try {
    // --- Phase 1: populate server with initial entries ---
    await writeBatch(idx => serverStorage.writeEvent(EVENT_TOPIC, { idx }), INITIAL_COUNT);
    await writeBatch(idx => serverStorage.upsertObject(OBJECT_TOPIC, `obj-${idx}`, { idx }), INITIAL_COUNT);

    // --- Phase 2: initial full sync (no prior local state) ---
    serverOps.drain();
    await node.sync(EVENT_TOPIC);
    await node.sync(OBJECT_TOPIC);

    assertEquals(
      (await node.getEvents(EVENT_TOPIC) ?? []).length,
      INITIAL_COUNT,
      "initial sync: all events replicated to client",
    );
    assertEquals(
      (await node.getObjects(OBJECT_TOPIC) ?? []).length,
      INITIAL_COUNT,
      "initial sync: all objects replicated to client",
    );

    // Second sync — first diff request for this topic. The server computes and caches the
    // full Merkle tree (one-time cost). Writes thereafter only invalidate the O(depth=20)
    // ancestor nodes of the changed entry, so subsequent diffs scan only affected leaves.
    await node.sync(EVENT_TOPIC);
    await node.sync(OBJECT_TOPIC);

    // --- Phase 3: add incremental entries to server ---
    await writeBatch(
      idx => serverStorage.writeEvent(EVENT_TOPIC, { idx: INITIAL_COUNT + idx }),
      INCREMENTAL_COUNT,
    );
    await writeBatch(
      idx => serverStorage.upsertObject(OBJECT_TOPIC, `obj-${INITIAL_COUNT + idx}`, { idx: INITIAL_COUNT + idx }),
      INCREMENTAL_COUNT,
    );
    const totalEvents = INITIAL_COUNT + INCREMENTAL_COUNT;
    const totalObjects = INITIAL_COUNT + INCREMENTAL_COUNT;

    // --- Phase 4: incremental diff-based sync ---
    // Drain before each sync to isolate the ops for that topic.
    serverOps.drain();
    await node.sync(EVENT_TOPIC);
    const eventIncrementalOps = serverOps.drain();

    await node.sync(OBJECT_TOPIC);
    const objectIncrementalOps = serverOps.drain();

    assertEquals(
      (await node.getEvents(EVENT_TOPIC) ?? []).length,
      totalEvents,
      "incremental sync: new events replicated",
    );
    assertEquals(
      (await node.getObjects(OBJECT_TOPIC) ?? []).length,
      totalObjects,
      "incremental sync: new objects replicated",
    );

    // Efficiency check: Merkle tree only scans the affected leaf nodes, not the entire topic.
    // With MERKLE_LEAF_SIZE=100 and INCREMENTAL_COUNT=1000, at most 10 leaves are scanned.
    assertLess(
      eventIncrementalOps.listItems,
      totalEvents,
      "incremental event sync: server scanned fewer items than the total (Merkle-efficient)",
    );
    assertLess(
      objectIncrementalOps.listItems,
      totalObjects,
      "incremental object sync: server scanned fewer items than the total (Merkle-efficient)",
    );

    // --- Phase 5: propagate an update and a deletion ---
    // Update event #1 and delete object "obj-0" directly on the server.
    await serverStorage.updateEvent(EVENT_TOPIC, 1, { updated: true });
    await serverStorage.deleteObject(OBJECT_TOPIC, "obj-0");

    serverOps.drain();
    await node.sync(EVENT_TOPIC);
    const eventDeleteOps = serverOps.drain();

    await node.sync(OBJECT_TOPIC);
    const objectDeleteOps = serverOps.drain();

    // Correctness: both changes must propagate to the client.
    const event1 = await node.getEvent(EVENT_TOPIC, 1);
    assertEquals(event1?.payload, { updated: true }, "updated event propagated to client");

    const obj0 = await node.getObject(OBJECT_TOPIC, "obj-0");
    assertEquals(obj0?.payload, null, "deleted object propagated as tombstone");

    // Efficiency: only the 1–2 affected Merkle leaves per topic were re-scanned.
    // Event: 1 changed leaf (IDs 1–100) → ~100 server listItems, well under 1500.
    // Object: 2 changed leaves (original seq leaf + new tombstone seq leaf) → ~200 listItems.
    assertLess(
      eventDeleteOps.listItems,
      totalEvents / 2,
      "event deletion sync: only affected leaf re-read",
    );
    assertLess(
      objectDeleteOps.listItems,
      totalObjects / 2,
      "object deletion sync: only affected leaves re-read",
    );

  } finally {
    await server.shutdown();
    await serverStorage.close();
    await clientStorage.close();
    await Deno.remove(serverTmpPath);
    await Deno.remove(clientTmpPath);
  }
});
