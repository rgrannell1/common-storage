import { OpineRequest, OpineResponse } from "https://deno.land/x/opine/mod.ts";
import { Status } from "https://deno.land/std/http/http_status.ts";

import type { IConfig } from "../../interfaces/config.ts";

export function topicPost(cfg: IConfig) {
  return async function (req: OpineRequest, res: OpineResponse) {
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

    const storage = cfg.storage();

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
