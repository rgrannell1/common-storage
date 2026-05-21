// Starts one interval per subscription config entry; each tick runs a full sync cycle.
// Returns a cleanup function that stops all intervals.

import type { SubscriptionConfig } from "../../commons/config.ts";
import type { IReadEvents, IUpdateEvent } from "../storage/capabilities.ts";
import { syncOnce } from "./sync.ts";
import { MS_PER_SECOND } from "../../commons/constants.ts";

type SchedulerStorage = IReadEvents & IUpdateEvent;

export function startSubscriptions(configs: SubscriptionConfig[], storage: SchedulerStorage): () => void {
  const intervals = configs.map(config => {
    return setInterval(async () => {
      try {
        await syncOnce(config, storage);
      } catch (err) {
        console.error(`Subscription sync failed for topic "${config.topic}":`, err);
      }
    }, config.frequency * MS_PER_SECOND);
  });

  return () => intervals.forEach(clearInterval);
}
