// Starts one cron per subscription config entry; each tick runs a full sync cycle.
// Returns a cleanup function that cancels all crons.

import type { SubscriptionConfig } from "../../commons/config.ts";
import type { IReadEvents, IUpdateEvent } from "../../storage/capabilities.ts";
import type { ILogger } from "../../commons/logger.ts";
import { syncOnce } from "./sync.ts";
import { startCron } from "../commons/cron.ts";

type SchedulerStorage = IReadEvents & IUpdateEvent;

// Converts a frequency in seconds to a cron expression.
// Sub-hour frequencies use minute-field steps; hour-or-above use hour-field steps.
function frequencyToCron(frequencySeconds: number): string {
  const minutes = Math.round(frequencySeconds / 60);
  if (minutes < 60) {
    return minutes === 1 ? "* * * * *" : `*/${minutes} * * * *`;
  }
  const hours = Math.round(minutes / 60);
  return hours === 1 ? "0 * * * *" : `0 */${hours} * * *`;
}

export function startSubscriptions(configs: SubscriptionConfig[], storage: SchedulerStorage, logger: ILogger): () => void {
  const cleanups = configs.map(config =>
    startCron(`cmstr-sub-${config.topic}`, frequencyToCron(config.frequency), async () => {
      try {
        await syncOnce(config, storage, logger);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error("subscription sync failed", undefined, {
          source: config.source,
          topic: config.topic,
          message: error.message,
          stack: error.stack,
        });
      }
    })
  );
  return () => cleanups.forEach(cleanup => cleanup());
}
