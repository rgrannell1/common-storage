import { OpineResponse } from "https://deno.land/x/opine/mod.ts";
import { Status } from "https://deno.land/std/http/http_status.ts";
import type { CommonStorageRequest } from "../../types/types.ts";

import type { IConfig } from "../.././types/interfaces/config.ts";

export function topicDelete(cfg: IConfig) {
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

    const storage = cfg.storage;

    await storage.addActivity({
      user: req.user as string,
      action: "topic-delete",
      createdAt: new Date().toISOString(),
      metadata: {
        topic: req.params.name,
      },
    });

    const deleteRes = await storage.deleteTopic(
      req.params.name,
    );

    res.status = Status.OK;
    res.send({
      existed: deleteRes.existed,
    });
  };
}
