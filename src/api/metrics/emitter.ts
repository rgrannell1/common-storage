// Periodic metrics emitter — snapshots the collector and upserts to the metrics object topic.
// Depends only on IUpsertObject; all collection is handled by collector.ts.

import type { IUpsertObject } from "../storage/capabilities.ts";
import type { MetricsCollector } from "./collector.ts";
import { METRICS_TOPIC, METRICS_CRON, METRICS_OBJECT_ID } from "../../commons/constants.ts";
import { startCron } from "../commons/cron.ts";

// Starts a cron that snapshots the collector and upserts the metrics object each minute.
// Returns a cleanup function that cancels the cron.
export function startMetricsLoop(storage: IUpsertObject, collector: MetricsCollector): () => void {
  return startCron("cmstr-metrics", METRICS_CRON, async () => {
    await storage.upsertObject(METRICS_TOPIC, METRICS_OBJECT_ID, await collector.snapshot());
  });
}
