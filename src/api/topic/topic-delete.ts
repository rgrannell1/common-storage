import { OpineRequest, OpineResponse } from "https://deno.land/x/opine/mod.ts";
import { Status } from "https://deno.land/std/http/http_status.ts";

import type { IConfig } from "../.././types/interfaces/config.ts";

export function topicDelete(cfg: IConfig) {
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

    const storage = cfg.storage;
    const deleteRes = await storage.deleteTopic(
      req.params.name,
    );

    res.status = Status.OK;
    res.send({
      existed: deleteRes.existed,
    });
  };
}
