// Server entry point — loads config, wires dependencies, and starts serving
// @design.md

import { Config } from "./src/commons/config.ts";
import { DEFAULT_HOST } from "./src/commons/constants.ts";
import { createApp } from "./src/api/app.ts";
import { xdgConfigHome, resolveConfigPath } from "./src/cli/paths.ts";
import type { TopicStats, Subscription } from "./src/api/storage/capabilities.ts";

async function loadConfig(path: string): Promise<Config> {
  const text = await Deno.readTextFile(path);
  return Config.parse(JSON.parse(text));
}

// Stub storage — replaced as capability interfaces are implemented on a real KV backend
const storage = {
  getTopicNames: (): Promise<string[]> => Promise.resolve([]),
  getTopicStats: (_topic: string): Promise<TopicStats | null> => Promise.resolve(null),
  getSubscriptions: (): Promise<Subscription[]> => Promise.resolve([]),
};

async function main(): Promise<void> {
  const configPath = resolveConfigPath(xdgConfigHome());
  const config = await loadConfig(configPath);
  const app = createApp({ storage });

  Deno.serve({ port: config.server.port, hostname: config.server.host ?? DEFAULT_HOST }, app.fetch);
}

await main();
