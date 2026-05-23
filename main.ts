// Server entry point — loads config, wires dependencies, and starts serving
// @design.md

import { loadConfig } from "./src/commons/config.ts";
import { DEFAULT_HOST, METRICS_TOPIC, CMSTR_CONFIG_PATH_ENV_VAR } from "./src/commons/constants.ts";
import { createApp } from "./src/api/app.ts";
import { DenoKVBackend } from "./src/api/storage/kv/index.ts";
import { xdgConfigHome, resolveConfigPath } from "./src/cli/paths.ts";
import { MetricsCollector } from "./src/api/metrics/collector.ts";
import { startMetricsLoop } from "./src/api/metrics/emitter.ts";
import { startSubscriptions } from "./src/api/subscriptions/scheduler.ts";
import { startGcLoop } from "./src/api/gc/sweeper.ts";
import { buildSchemaRegistry } from "./src/api/parsers/payload-schema.ts";
import { StderrLogger } from "./src/commons/logger.ts";

const configPath = Deno.env.get(CMSTR_CONFIG_PATH_ENV_VAR) ?? resolveConfigPath(xdgConfigHome());
const config = await loadConfig(configPath);

const storage = new DenoKVBackend();
await storage.init();
await storage.createTopics(config.events ?? [], config.objects ?? []);

// Ensure the reserved metrics topic always exists, independent of user config
await storage.createTopics([], [{ name: METRICS_TOPIC }]);

const schemas = await buildSchemaRegistry(config.events ?? [], config.objects ?? []);

const logger = new StderrLogger();
const collector = new MetricsCollector(storage);
startMetricsLoop(storage, collector);
startSubscriptions(config.subscriptions ?? [], storage, logger);
startGcLoop(storage, (config.objects ?? []).map(topic => topic.name));
const app = createApp({ storage, collector, config, schemas, logger });

// Deno Deploy uses the default export; local dev uses Deno.serve via `deno run`
export default { fetch: app.fetch } satisfies Deno.ServeDefaultExport;

if (import.meta.main) {
  Deno.serve({ port: config.server.port, hostname: config.server.host ?? DEFAULT_HOST }, app.fetch);
}
