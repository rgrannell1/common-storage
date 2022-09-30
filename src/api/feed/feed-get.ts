import { OpineRequest, OpineResponse } from "https://deno.land/x/opine/mod.ts";

import type { IConfig } from "../../interfaces/config.ts";

export function feedGet(cfg: IConfig) {
  return async function (_: OpineRequest, res: OpineResponse) {
    const storage = cfg.storage();

    // -- suboptimal
    const topicNames = await storage.getTopicNames();
    const topicStats = await Promise.all(
      topicNames.map(async (topicName: string) => {
        return await storage.getTopicStats(topicName);
      }),
    );

    res.send({
      description: cfg.description(),
      title: cfg.title(),
      type: "common-storage",
      version: "v0.1",
      topics: topicStats,
    });
  };
}
