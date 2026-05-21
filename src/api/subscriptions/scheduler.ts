// Starts one cron per subscription config entry; each tick runs a full sync cycle.
// Returns a cleanup function that cancels all crons.

import type { SubscriptionConfig } from "../../commons/config.ts";
import type { IReadEvents, IUpdateEvent } from "../storage/capabilities.ts";
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

export function startSubscriptions(configs: SubscriptionConfig[], storage: SchedulerStorage): () => void {
  const cleanups = configs.map(config =>
    startCron(`cmstr-sub-${config.topic}`, frequencyToCron(config.frequency), async () => {
      try {
        await syncOnce(config, storage);
      } catch (err) {
        console.error(`Subscription sync failed for topic "${config.topic}":`, err);
      }
    })
  );
  return () => cleanups.forEach(cleanup => cleanup());
}
