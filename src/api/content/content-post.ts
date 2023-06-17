import { OpineResponse } from "https://deno.land/x/opine/mod.ts";
import { Status } from "https://deno.land/std/http/http_status.ts";
import type { CommonStorageRequest } from "../../types/types.ts";

import type { IConfig } from "../../types/interfaces/config.ts";
import type { IStorage } from "../../types/interfaces/storage.ts";

export function contentPost(cfg: IConfig) {
  return async function (req: CommonStorageRequest, res: OpineResponse) {
    const storage = cfg.storage as IStorage;

    storage.addActivity({
      user: req.user as string,
      action: "content-post",
      createdAt: new Date().toISOString(),
      metadata: {
        topic: req.params.topic,
        requestId: req.requestId,
      },
    });

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
