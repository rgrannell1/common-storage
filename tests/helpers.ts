// Shared test setup — creates an isolated storage backend shared across per-request ephemeral servers
// @work.md

import { makeFetch } from "@deno-libs/superfetch";
import { DenoKVBackend } from "../src/api/storage/kv/index.ts";
import { createApp } from "../src/api/app.ts";
import { MetricsCollector } from "../src/api/metrics/collector.ts";
import type { Config, TopicConfig } from "../src/commons/config.ts";
import type { RateLimitConfig } from "../src/api/middleware/rate-limit.ts";
import { mintToken } from "../src/commons/auth.ts";
import { buildSchemaRegistry } from "../src/api/parsers/payload-schema.ts";

const TEST_ROOT_KEY_VAR = "CS_TEST_ROOT_KEY";

// Hardcoded value — never use in production
const TEST_ROOT_KEY_VALUE = "test-root-key-do-not-use-in-production-32b";

const TEST_CONFIG: Config = {
  server: { port: 0 },
  rootKey: TEST_ROOT_KEY_VAR,
};

Deno.env.set(TEST_ROOT_KEY_VAR, TEST_ROOT_KEY_VALUE);

export const TEST_TOKEN = mintToken(TEST_ROOT_KEY_VALUE, "test", {});

function withAuth(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers);
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${TEST_TOKEN}`);
  }
  return { ...init, headers };
}

// superfetch shuts the server down after every request, so each call to `request` creates a
// fresh ephemeral server — but they all share the same underlying storage backend.
export type TestContext = {
  request: (url: string, init?: RequestInit) => ReturnType<ReturnType<typeof makeFetch>>;
  cleanup: () => Promise<void>;
};

export async function makeTestContext(
  events: TopicConfig[] = [],
  objects: TopicConfig[] = [],
  rateLimits?: RateLimitConfig,
): Promise<TestContext> {
  const tmpPath = await Deno.makeTempFile({ suffix: ".db" });
  const storage = new DenoKVBackend(tmpPath);

  await storage.init();
  await storage.createTopics(events, objects);

  const schemas = await buildSchemaRegistry(events, objects);
  const app = createApp({ storage, collector: new MetricsCollector(), config: TEST_CONFIG, schemas, rateLimits });

  const request = (url: string, init?: RequestInit) => makeFetch(app.fetch)(url, withAuth(init));

  const cleanup = async () => {
    await storage.close();
    await Deno.remove(tmpPath);
  };

  return { request, cleanup };
}

// makePersistentServer starts a real server that stays up for the test's lifetime.
// Use this when you need to read response body values across multiple requests,
// since superfetch pre-consumes bodies and prevents direct .json() access.
export type PersistentTestContext = {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  cleanup: () => Promise<void>;
};

export async function makePersistentServer(
  events: TopicConfig[] = [],
  objects: TopicConfig[] = [],
  rateLimits?: RateLimitConfig,
): Promise<PersistentTestContext> {
  const tmpPath = await Deno.makeTempFile({ suffix: ".db" });
  const storage = new DenoKVBackend(tmpPath);

  await storage.init();
  await storage.createTopics(events, objects);

  const schemas = await buildSchemaRegistry(events, objects);
  const app = createApp({ storage, collector: new MetricsCollector(), config: TEST_CONFIG, schemas, rateLimits });
  const server = Deno.serve({ port: 0 }, app.fetch);
  const { port } = server.addr;

  const fetch = (url: string, init?: RequestInit) =>
    globalThis.fetch(`http://localhost:${port}${url}`, withAuth(init));

  const cleanup = async () => {
    await server.shutdown();
    await storage.close();
    await Deno.remove(tmpPath);
  };

  return { fetch, cleanup };
}

// Creates a persistent server that sends requests without adding an auth token — used to prove routes reject unauthenticated requests.
export async function makeUnauthContext(
  events: TopicConfig[] = [],
  objects: TopicConfig[] = [],
): Promise<PersistentTestContext> {
  const tmpPath = await Deno.makeTempFile({ suffix: ".db" });
  const storage = new DenoKVBackend(tmpPath);

  await storage.init();
  await storage.createTopics(events, objects);

  const schemas = await buildSchemaRegistry(events, objects);
  const app = createApp({ storage, collector: new MetricsCollector(), config: TEST_CONFIG, schemas });
  const server = Deno.serve({ port: 0 }, app.fetch);
  const { port } = server.addr;

  const fetch = (url: string, init?: RequestInit) =>
    globalThis.fetch(`http://localhost:${port}${url}`, init);

  const cleanup = async () => {
    await server.shutdown();
    await storage.close();
    await Deno.remove(tmpPath);
  };

  return { fetch, cleanup };
}

// Cancel a response body without reading it; prevents Deno's "body not consumed" leak detection.
export async function discard(res: Response): Promise<void> {
  await res.body?.cancel();
}

export function jsonPost(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function jsonPut(body: unknown): RequestInit {
  return {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
