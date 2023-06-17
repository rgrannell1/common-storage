import { OpineResponse } from "https://deno.land/x/opine/mod.ts";
import { Status } from "https://deno.land/std/http/http_status.ts";
import type { CommonStorageRequest } from "../../types/types.ts";

import type { IConfig } from "../../types/interfaces/config.ts";

export function subscriptionGet(cfg: IConfig) {
  return async function (req: CommonStorageRequest, res: OpineResponse) {
    try {
      const storage = cfg.storage;

      if (!req.params.topic) {
        res.status = Status.UnprocessableEntity;
        res.send({
          error: {
            message: "topic not provided",
          },
        });
        return;
      }

      const topic = req.params.topic;

      const subscription = await storage.getSubscription(topic);
      const stats = await storage.getSubscriptionStats(topic);

      await storage.addActivity({
        user: req.user as string,
        action: "subscription-get",
        createdAt: new Date().toISOString(),
        metadata: {
          topic,
        },
      });

      res.send({
        ...subscription,
        ...stats,
      });
    } catch (err) {
      console.log(err);
      console.log("+++++++++++++++++++++++++++++");

      res.status = 500;
      res.send({
        error: {
          message: "internal error occurred",
        },
      });
    }
  };
}
