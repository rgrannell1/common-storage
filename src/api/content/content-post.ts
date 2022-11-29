import { OpineRequest, OpineResponse } from "https://deno.land/x/opine/mod.ts";
import { Status } from "https://deno.land/std/http/http_status.ts";

import type { IConfig } from "../../types/interfaces/config.ts";
import type { IStorage } from "../../types/interfaces/storage.ts";

export function contentPost(cfg: IConfig) {
  return async function (req: OpineRequest, res: OpineResponse) {
    const storage = cfg.storage as IStorage;

    if (!req.params.topic) {
      res.status = Status.UnprocessableEntity;
      res.send({
        error: {
          message: "topic not provided",
        },
      });
      return;
    }

    if (!req.body.content) {
      res.status = Status.UnprocessableEntity;
      res.send({
        error: {
          message: "content not provided",
        },
      });
      return;
    }

    const batchId = req.body.batchId;
    const topic = req.params.topic;
    const content = req.body.content;

    await storage.addContent(batchId, topic, content);
    const stats = await storage.getTopicStats(topic);

    res.status = Status.OK;
    res.send({
      batch: {
        id: batchId,
        status: content.length === 0 ? "closed" : "open",
      },
      topic,
      stats: {
        added: content.length,
        total: stats.stats.count,
      },
    });
  };
}
