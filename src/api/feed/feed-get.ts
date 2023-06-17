import { OpineRequest, OpineResponse } from "https://deno.land/x/opine/mod.ts";

import type { IConfig } from "../.././types/interfaces/config.ts";
import type { CommonStorageRequest } from "../../types/types.ts";

export function feedGet(cfg: IConfig) {
  return async function (req: CommonStorageRequest, res: OpineResponse) {
    try {
      const storage = cfg.storage;

      storage.addActivity({
        user: req.user as string,
        action: "feed-get",
        createdAt: new Date().toISOString(),
        metadata: {},
      });

      // -- suboptimal
      const topicNames = await storage.getTopicNames();
      const topicStats = await Promise.all(
        topicNames.map(async (topicName: string) => {
          return await storage.getTopicStats(topicName);
        }),
      );

      res.send({
        description: cfg.description,
        title: cfg.title,
        version: "v0.1",
        topics: topicStats,
      });
    } catch (err) {
      cfg.logger.info("internal server error", {
        message: err.message,
        stack: err.stack,
      });
      res.status = 500;
      res.send({
        error: {
          message: "An internal server error occured",
        },
      });
    }
  };
}
