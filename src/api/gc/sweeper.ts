// Periodic tombstone GC — deletes object tombstones older than TOMBSTONE_RETENTION_MS.

import type { ISweepTombstones } from "../../storage/capabilities.ts";
import { GC_CRON } from "../../commons/constants.ts";
import { startCron } from "../commons/cron.ts";

// Starts a daily cron that sweeps expired tombstones across all object topics in parallel.
// Returns a cleanup function that cancels the cron.
export function startGcLoop(storage: ISweepTombstones, objectTopics: string[]): () => void {
  return startCron("cmstr-gc", GC_CRON, async () => {
    await Promise.all(objectTopics.map(topic => storage.sweepTombstones(topic)));
  });
}
