// Shared test setup — creates an isolated storage backend shared across per-request ephemeral servers
// @design.md

import { makeFetch } from "@deno-libs/superfetch";
import { DenoKVBackend } from "../src/api/storage/kv.ts";
import { createApp } from "../src/api/app.ts";
import type { TopicConfig } from "../src/commons/config.ts";

// superfetch shuts the server down after every request, so each call to `request` creates a
// fresh ephemeral server — but they all share the same underlying storage backend.
export type TestContext = {
  request: (url: string, init?: RequestInit) => ReturnType<ReturnType<typeof makeFetch>>;
  cleanup: () => Promise<void>;
};

export async function makeTestContext(
  events: TopicConfig[] = [],
  objects: TopicConfig[] = [],
): Promise<TestContext> {
  const tmpPath = await Deno.makeTempFile({ suffix: ".db" });
  const storage = new DenoKVBackend(tmpPath);

  await storage.init();
  await storage.createTopics(events, objects);

  const app = createApp({ storage });

  const request = (url: string, init?: RequestInit) => makeFetch(app.fetch)(url, init);

  const cleanup = async () => {
    await storage.close();
    await Deno.remove(tmpPath);
  };

  return { request, cleanup };
}

export function jsonPost(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
