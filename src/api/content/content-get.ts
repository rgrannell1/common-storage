import { OpineRequest, OpineResponse } from "https://deno.land/x/opine/mod.ts";
import { Status } from "https://deno.land/std/http/http_status.ts";

import type { IConfig } from "../../types/interfaces/config.ts";

const START_ID_PATTERN = /[0-9]+/;

export function contentGet(cfg: IConfig) {
  return async function (req: OpineRequest, res: OpineResponse) {
    try {
      const storage = cfg.storage;

      if (!req.params.topic) {
        res.status = Status.UnprocessableEntity;
        res.send({
          error: {
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
          error: {
            message: `topic "${topic}" does not exist`,
          },
        });
        return;
      }

      if (req.query.startId) {
        if (!START_ID_PATTERN.test(req.query.startId)) {
          res.status = Status.UnprocessableEntity;
          res.send({
            error: {
              message: `startId was malformed`,
            },
          });
          return;
        }
      }

      // enumerate from chosen id if present
      const startId = req.query.startId ?? undefined;

      const content = await storage.getContent(topic, startId);
      res.send(content);
    } catch (err) {
      console.log(err);
      console.log("+++++++++++++++++++++++++++++");

      res.status = 500;
      res.send({
        error: {
          message: "internal error occurred",
        },
      });
    }
  };
}
