// Tests that CommonStorageNode invalidates the Merkle hash cache after local writes.
// Without invalidation, postEvent/putEvent leave a stale cache that causes spurious re-fetches:
// the next diff sees the cached (stale) hash missing the local event and re-downloads it.
// @work.md

import { assertEquals } from "@std/assert";
import { DenoKVBackend } from "../src/storage/kv/index.ts";
import { CommonStorageNode } from "../src/core/node.ts";
import type { IScheduler } from "../src/core/node.ts";
import type { ILocalMerkleStore, ISyncBackend } from "../src/storage/backend.ts";
import { createApp } from "../src/api/app.ts";
import { MetricsCollector } from "../src/api/metrics/collector.ts";
import { buildSchemaRegistry } from "../src/api/parsers/payload-schema.ts";
import { NoopLogger } from "../src/commons/logger.ts";
import { TEST_TOKEN, TEST_ROOT_KEY_VAR } from "./helpers.ts";
import type { Config } from "../src/commons/config.ts";

const TOPIC = "node-local-write-test";

// Short tail — avoids the 5s production timeout in each sync cycle
const TEST_TAIL_MS = 100;

const NO_OP_SCHEDULER: IScheduler = {
  schedule: () => {},
  cancelAll: () => {},
};

// Records every ID passed to invalidatePath / invalidatePaths.
// Hashes always return "" — only invalidation tracking matters for these tests.
class TrackingMerkleStore implements ILocalMerkleStore {
  readonly invalidatedIds: number[] = [];

  forTopic(_topic: string) {
    return {
      hashForRange: (_start: number, _end: number): Promise<string> => Promise.resolve(""),
    };
  }

  hashForRange(_topic: string, _start: number, _end: number): Promise<string> {
    return Promise.resolve("");
  }

  invalidatePath(_topic: string, id: number): Promise<void> {
    this.invalidatedIds.push(id);
    return Promise.resolve();
  }

  invalidatePaths(_topic: string, newId: number, oldId?: number): Promise<void> {
    this.invalidatedIds.push(newId);
    if (oldId !== undefined && oldId !== newId) this.invalidatedIds.push(oldId);
    return Promise.resolve();
  }
}

async function openClientWithTracker(path: string): Promise<{
  backend: ISyncBackend;
  merkleStore: TrackingMerkleStore;
  storage: DenoKVBackend;
}> {
  const storage = new DenoKVBackend(path);
  await storage.init();
  await storage.createTopics([{ name: TOPIC }], []);
  const merkleStore = new TrackingMerkleStore();
  const backend: ISyncBackend = {
    events: storage.events,
    objects: storage.objects,
    cursors: storage.cursors,
    merkleEvents: merkleStore,
  };
  return { backend, merkleStore, storage };
}

type WriteCase = {
  label: string;
  // Runs before the measured write; invalidations from prewrite are cleared before the assertion.
  prewrite?: (node: CommonStorageNode) => Promise<void>;
  write: (node: CommonStorageNode) => Promise<number | null>;
};

const WRITE_CASES: WriteCase[] = [
  {
    label: "postEvent",
    write: async (node) => {
      const entry = await node.postEvent(TOPIC, { value: 1 });
      return entry?.id ?? null;
    },
  },
  {
    label: "putEvent",
    // First create the event so putEvent has something to update.
    prewrite: async (node) => {
      await node.postEvent(TOPIC, { value: 0 });
    },
    write: async (node) => {
      const entry = await node.putEvent(TOPIC, 1, { value: 2 });
      return entry?.id ?? null;
    },
  },
];

for (const testCase of WRITE_CASES) {
  Deno.test(
    `Proves ${testCase.label} invalidates the Merkle hash cache for the written event`,
    async () => {
    const tmpPath = await Deno.makeTempFile({ suffix: ".db" });
    const { backend, merkleStore, storage } = await openClientWithTracker(tmpPath);

    const node = new CommonStorageNode(
      { backend, scheduler: NO_OP_SCHEDULER, logger: new NoopLogger() },
      {}, // no server subscriptions needed — push failure is swallowed, write is still local
    );

    try {
      if (testCase.prewrite) {
        await testCase.prewrite(node);
        merkleStore.invalidatedIds.splice(0); // isolate: clear prewrite's invalidations
      }

      const writtenId = await testCase.write(node);

      const returnedEntryMsg = `${testCase.label} must return the written entry`;
      assertEquals(writtenId !== null, true, returnedEntryMsg);
      const invalidateMsg = `${testCase.label} must call invalidatePath for id ${writtenId}`;
      assertEquals(
        merkleStore.invalidatedIds.includes(writtenId!),
        true,
        invalidateMsg,
      );
    } finally {
      await storage.close();
      await Deno.remove(tmpPath);
    }
  });
}

Deno.test("Proves sync after postEvent does not download duplicate events", async () => {
  const serverTmpPath = await Deno.makeTempFile({ suffix: ".db" });
  const serverStorage = new DenoKVBackend(serverTmpPath);
  await serverStorage.init();
  await serverStorage.createTopics([{ name: TOPIC }], []);

  const schemas = await buildSchemaRegistry([{ name: TOPIC }], []);
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

  const clientTmpPath = await Deno.makeTempFile({ suffix: ".db" });
  const clientStorage = new DenoKVBackend(clientTmpPath);
  await clientStorage.init();
  await clientStorage.createTopics([{ name: TOPIC }], []);

  const node = new CommonStorageNode(
    { backend: clientStorage, scheduler: NO_OP_SCHEDULER, logger: new NoopLogger() },
    {
      events: [{
        topic: TOPIC,
        remoteUrl: baseUrl,
        token: TEST_TOKEN,
        intervalMs: 60_000,
        tailDurationMs: TEST_TAIL_MS,
      }],
    },
  );

  try {
    // Write 5 events locally — each is written to local IDB and pushed to the server.
    for (let idx = 0; idx < 5; idx++) {
      await node.postEvent(TOPIC, { idx });
    }

    // First sync: cursor is 0 so this is a full fetch. Events already exist locally at matching
    // IDs, so updateEvent upserts them in-place — count stays at 5.
    await node.sync(TOPIC);
    const afterFirstSync = (await node.getEvents(TOPIC) ?? []).length;
    assertEquals(afterFirstSync, 5, "first sync: all 5 posted events present");

    // Second sync: cursor > 0, Merkle diff runs. Local tree must match server
    // (both have the same 5 events at the same IDs), so no range fetches happen
    // and count stays at 5.
    await node.sync(TOPIC);
    const afterSecondSync = (await node.getEvents(TOPIC) ?? []).length;
    const noDuplicateMsg =
      "second sync must not download duplicate copies of locally-posted events";
    assertEquals(afterSecondSync, 5, noDuplicateMsg);
  } finally {
    await server.shutdown();
    await serverStorage.close();
    await clientStorage.close();
    await Deno.remove(serverTmpPath);
    await Deno.remove(clientTmpPath);
  }
});

Deno.test(
  "Proves postEvent adopts the server-assigned id when client and server event counters diverge",
  async () => {
  const serverTmpPath = await Deno.makeTempFile({ suffix: ".db" });
  const serverStorage = new DenoKVBackend(serverTmpPath);
  await serverStorage.init();
  await serverStorage.createTopics([{ name: TOPIC }], []);

  const schemas = await buildSchemaRegistry([{ name: TOPIC }], []);
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

  const clientTmpPath = await Deno.makeTempFile({ suffix: ".db" });
  const clientStorage = new DenoKVBackend(clientTmpPath);
  await clientStorage.init();
  await clientStorage.createTopics([{ name: TOPIC }], []);

  const node = new CommonStorageNode(
    { backend: clientStorage, scheduler: NO_OP_SCHEDULER, logger: new NoopLogger() },
    {
      events: [{
        topic: TOPIC,
        remoteUrl: baseUrl,
        token: TEST_TOKEN,
        intervalMs: 60_000,
        tailDurationMs: TEST_TAIL_MS,
      }],
    },
  );

  try {
    // Seed the server directly so its event counter is ahead of the fresh client's.
    for (let idx = 0; idx < 3; idx++) {
      const res = await fetch(`${baseUrl}/events/${TOPIC}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${TEST_TOKEN}` },
        body: JSON.stringify({ payload: { seed: idx } }),
      });
      await res.body?.cancel();
    }

    // Client counter is 0, so the optimistic local write lands at id 1; the
    // server assigns id 4.
    const entry = await node.postEvent(TOPIC, { mine: true });
    const serverAssignedMsg =
      "postEvent must return the server-assigned id, not the optimistic local id";
    assertEquals(entry?.id, 4, serverAssignedMsg);
    const storedAtServerIdMsg = "entry must be stored locally at the server id";
    assertEquals(await node.getEvent(TOPIC, 4) !== null, true, storedAtServerIdMsg);
    const noPhantomMsg = "the optimistic local id must be relocated away, leaving no phantom";
    assertEquals(await node.getEvent(TOPIC, 1), null, noPhantomMsg);

    // Sync pulls the 3 seeds; the client's own write is not duplicated.
    await node.sync(TOPIC);
    const all = await node.getEvents(TOPIC) ?? [];
    const syncMsg =
      "after sync: 3 seeded events + 1 own write, with no duplicate of the relocated write";
    assertEquals(all.length, 4, syncMsg);
  } finally {
    await server.shutdown();
    await serverStorage.close();
    await clientStorage.close();
    await Deno.remove(serverTmpPath);
    await Deno.remove(clientTmpPath);
  }
});
