// Server entry point — loads config, wires dependencies, and starts serving
// @design.md

import { loadConfig } from "./src/commons/config.ts";
import { DEFAULT_HOST, METRICS_TOPIC } from "./src/commons/constants.ts";
import { createApp } from "./src/api/app.ts";
import { DenoKVBackend } from "./src/api/storage/kv/index.ts";
import { xdgConfigHome, resolveConfigPath } from "./src/cli/paths.ts";
import { MetricsCollector } from "./src/api/metrics/collector.ts";
import { startMetricsLoop } from "./src/api/metrics/emitter.ts";
import { startSubscriptions } from "./src/api/subscriptions/scheduler.ts";
import { buildSchemaRegistry } from "./src/api/parsers/payload-schema.ts";

async function main(): Promise<void> {
  const configPath = resolveConfigPath(xdgConfigHome());
  const config = await loadConfig(configPath);

  const storage = new DenoKVBackend();
  await storage.init();
  await storage.createTopics(config.events ?? [], config.objects ?? []);

  // Ensure the reserved metrics topic always exists, independent of user config
  await storage.createTopics([], [{ name: METRICS_TOPIC }]);

  const schemas = await buildSchemaRegistry(config.events ?? [], config.objects ?? []);

  const collector = new MetricsCollector();
  startMetricsLoop(storage, collector);
  startSubscriptions(config.subscriptions ?? [], storage);

  const app = createApp({ storage, collector, config, schemas });

  Deno.serve({ port: config.server.port, hostname: config.server.host ?? DEFAULT_HOST }, app.fetch);
}

await main();
