// Server entry point — loads config, wires dependencies, and starts serving
// @design.md

import { Config } from "./src/commons/config.ts";
import { DEFAULT_HOST } from "./src/commons/constants.ts";
import { createApp } from "./src/api/app.ts";
import { DenoKVBackend } from "./src/api/storage/kv.ts";
import { xdgConfigHome, resolveConfigPath } from "./src/cli/paths.ts";

async function loadConfig(path: string): Promise<Config> {
  const text = await Deno.readTextFile(path);
  return Config.parse(JSON.parse(text));
}

async function main(): Promise<void> {
  const configPath = resolveConfigPath(xdgConfigHome());
  const config = await loadConfig(configPath);

  const storage = new DenoKVBackend();
  await storage.init();
  await storage.createTopics(config.events ?? [], config.objects ?? []);

  const app = createApp({ storage });

  Deno.serve({ port: config.server.port, hostname: config.server.host ?? DEFAULT_HOST }, app.fetch);
}

await main();
