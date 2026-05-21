// Periodic metrics emitter — snapshots the collector and upserts to the metrics object topic.
// Depends only on IUpsertObject; all collection is handled by collector.ts.

import type { IUpsertObject } from "../storage/capabilities.ts";
import type { MetricsCollector } from "./collector.ts";
import { METRICS_TOPIC } from "../../commons/constants.ts";

// How often to upsert the metrics object, in milliseconds
const METRICS_INTERVAL_MS = 60_000;

// Fixed object ID — always overwritten; the topic holds one live snapshot
const METRICS_OBJECT_ID = "latest";

// Starts a periodic loop that snapshots the collector and upserts the metrics object.
// Returns a cleanup function that stops the loop.
export function startMetricsLoop(storage: IUpsertObject, collector: MetricsCollector): () => void {
  const intervalId = setInterval(async () => {
    await storage.upsertObject(METRICS_TOPIC, METRICS_OBJECT_ID, collector.snapshot());
  }, METRICS_INTERVAL_MS);
  return () => clearInterval(intervalId);
}
