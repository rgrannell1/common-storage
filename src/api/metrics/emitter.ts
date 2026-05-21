// Periodic metrics emitter — flushes the collector and writes a snapshot event to the metrics topic.
// Depends only on IWriteEvent; all collection is handled by collector.ts.

import type { IWriteEvent } from "../storage/capabilities.ts";
import type { MetricsCollector } from "./collector.ts";
import { METRICS_TOPIC } from "../../commons/constants.ts";

// How often to emit a metrics event, in milliseconds
const METRICS_INTERVAL_MS = 60_000;

type MetricsPayload = {
  requests: {
    total: number;
    byMethod: Record<string, number>;
    byStatus: Record<string, number>;
  };
  periodMs: number;
  timestamp: number;
};

async function emitSnapshot(storage: IWriteEvent, collector: MetricsCollector, periodMs: number): Promise<void> {
  const snapshot = collector.flush();
  const payload: MetricsPayload = {
    requests: snapshot,
    periodMs,
    timestamp: Date.now(),
  };
  await storage.writeEvent(METRICS_TOPIC, payload);
}

// Starts a periodic loop that flushes the collector and writes a metrics event.
// Returns a cleanup function that stops the loop.
export function startMetricsLoop(storage: IWriteEvent, collector: MetricsCollector): () => void {
  const intervalId = setInterval(
    () => emitSnapshot(storage, collector, METRICS_INTERVAL_MS),
    METRICS_INTERVAL_MS,
  );
  return () => clearInterval(intervalId);
}
