import { OpineRequest, OpineResponse } from "https://deno.land/x/opine/mod.ts";
import { Status } from "https://deno.land/std/http/http_status.ts";
import type { CommonStorageRequest } from "../../types/types.ts";

import type { IConfig } from "../.././types/interfaces/config.ts";

export function topicGet(cfg: IConfig) {
  return async function (req: CommonStorageRequest, res: OpineResponse) {
    const storage = cfg.storage;

    try {
      const topic = await storage.getTopic(req.params.name);

      await storage.addActivity({
        user: req.user as string,
        action: "topic-get",
        createdAt: new Date().toISOString(),
        metadata: {
          topic,
        },
      });

      res.status = Status.OK;
      res.send({
        name: topic.name,
        description: topic.description,
        created: topic.created,
      });
    } catch (err) {
      res.status = Status.NotFound;
      res.send({
        error: {
          message: "Topic does not exist",
        },
      });
    }
  };
}
