import { OpineRequest, OpineResponse } from "https://deno.land/x/opine/mod.ts";
import { Status } from "https://deno.land/std/http/http_status.ts";
import type { CommonStorageRequest } from "../../types/types.ts";

import type { IConfig } from "../.././types/interfaces/config.ts";

export function topicPost(cfg: IConfig) {
  return async function (req: CommonStorageRequest, res: OpineResponse) {
    if (!req.params.name) {
      res.status = Status.UnprocessableEntity;
      res.send({
        error: {
          message: "name not provided",
        },
      });
      return;
    }

    if (!req.body.description) {
      res.status = Status.UnprocessableEntity;
      res.send({
        error: {
          message: "description not provided in body",
        },
      });
      return;
    }

    const storage = cfg.storage;

    await storage.addActivity({
      user: req.user as string,
      action: "topic-post",
      createdAt: new Date().toISOString(),
      metadata: {
        topic: req.params.name,
      },
    });

    const addRes = await storage.addTopic(
      req.params.name,
      req.body.description,
    );

    res.status = Status.OK;
    res.send({
      existed: addRes.existed,
    });
  };
}
