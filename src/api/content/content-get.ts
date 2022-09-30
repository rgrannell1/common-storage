import { OpineRequest, OpineResponse } from "https://deno.land/x/opine/mod.ts";
import { Status } from "https://deno.land/std/http/http_status.ts";

import type { IConfig } from "../../interfaces/config.ts";

export function contentGet(cfg: IConfig) {
  return async function (req: OpineRequest, res: OpineResponse) {
    const storage = cfg.storage();

    if (!req.params.topic) {
      res.status = Status.UnprocessableEntity;
      res.send({
        errors: {
          message: "topic not provided",
        },
      });
      return;
    }

    const topic = req.params.topic;

    // -- return 404 on missing topic
    try {
      await storage.getTopic(topic);
    } catch (err) {
      res.status = Status.NotFound;
      res.send({
        errors: {
          message: `topic "${topic}" does not exist`,
        },
      });
    }

    // enumerate from chosen id if present
    const startId = req.query.startId ?? undefined;

    const content = await storage.getContent(topic, startId);
    res.send(content);
  };
}
