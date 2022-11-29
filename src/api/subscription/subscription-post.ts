import { OpineRequest, OpineResponse } from "https://deno.land/x/opine/mod.ts";
import { Status } from "https://deno.land/std/http/http_status.ts";

import type { IConfig } from "../../types/interfaces/config.ts";
import type { IStorage } from "../../types/interfaces/storage.ts";

export function subscriptionPost(cfg: IConfig) {
  return async function (req: OpineRequest, res: OpineResponse) {
    const storage = cfg.storage as IStorage;

    if (!req.body.topic) {
      res.status = Status.UnprocessableEntity;
      res.send({
        error: {
          message: "topic not provided",
        },
      });
      return;
    }

    if (!req.body.target) {
      res.status = Status.UnprocessableEntity;
      res.send({
        error: {
          message: "target not provided",
        },
      });
      return;
    }

    if (!req.body.frequency) {
      res.status = Status.UnprocessableEntity;
      res.send({
        error: {
          message: "frequency not provided",
        },
      });
      return;
    }

    const { topic, target, frequency } = req.body;
    console.log([topic, target, frequency]);

    await storage.addSubscription(topic, target, parseInt(frequency));

    res.send("asd");
  };
}
