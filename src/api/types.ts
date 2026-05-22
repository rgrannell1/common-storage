// Top-level API dependency types
// @work.md

import type { IFullStorage } from "./storage/capabilities.ts";
import type { MetricsCollector } from "./metrics/collector.ts";
import type { Config } from "../commons/config.ts";
import type { TopicSchemaRegistry } from "./parsers/payload-schema.ts";
import type { RateLimitConfig } from "./middleware/rate-limit.ts";
import type { ILogger } from "../commons/logger.ts";

// Injected into every route handler and middleware; holds all server-wide singletons.
export type AppDeps = {
  storage: IFullStorage;
  collector: MetricsCollector;
  config: Config;
  schemas: TopicSchemaRegistry;
  logger: ILogger;
  rateLimits?: RateLimitConfig;
};
