import { OpineResponse } from "https://deno.land/x/opine/mod.ts";
import { Status } from "https://deno.land/std/http/http_status.ts";
import type { CommonStorageRequest } from "../../types/types.ts";

import type { IConfig } from "../../types/interfaces/config.ts";
import type { IStorage } from "../../types/interfaces/storage.ts";

export function subscriptionPost(cfg: IConfig) {
  return async function (req: CommonStorageRequest, res: OpineResponse) {
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

    await storage.addActivity({
      user: req.user as string,
      action: "subscription-post",
      createdAt: new Date().toISOString(),
      metadata: {
        topic,
      },
    });

    try {
      await storage.getTopic(req.params.name);
    } catch (err) {
      res.status = Status.NotFound;
      res.send({
        error: {
          message: "Topic does not exist",
        },
      });
    }

    const { id } = await storage.addSubscription(
      topic,
      target,
      parseInt(frequency),
    );

    res.send({ id });
  };
}
