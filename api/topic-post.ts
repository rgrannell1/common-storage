import Ajv from "https://esm.sh/ajv";
import { Status } from "https://deno.land/std/http/http_status.ts";
import type { Config, IAddTopic, ILogger, SchemaValidator } from "../types.ts";
import { RequestPart } from "../types.ts";
import { BodyParsers } from "../services/parsers.ts";

type Services = {
  storage: IAddTopic;
  logger: ILogger;
  schema: SchemaValidator;
};

const ajv = new Ajv({ allErrors: true });

type PostTopicConfig = Partial<Config>;

export function postTopic(_: PostTopicConfig, services: Services) {
  const { storage, logger, schema } = services;

  return async function (ctx: any) {
    await logger.addActivity({
      request: ctx.request,
      message: "starting request",
      metadata: {},
    });

    const topic = ctx.params?.topic;
    const body = await BodyParsers.json(ctx.request);
    const { description, schema: contentSchema } = body;

    schema("topicPost", body, RequestPart.Body);
    schema("topicPost", ctx.params, RequestPart.Params);

    if (typeof contentSchema !== "undefined") {
      try {
        ajv.compile(contentSchema);
      } catch (err) {
        await logger.addActivity({
          request: ctx.request,
          message: "failed to compile schema",
          metadata: {
            topic,
            schema: contentSchema,
          },
        });

        ctx.response.status = Status.UnprocessableEntity;
        ctx.response.body = JSON.stringify({
          error: "Failed to compile schema",
        });
        return;
      }
    }

    await logger.addActivity({
      request: ctx.request,
      message: "adding topic",
      metadata: {
        topic,
      },
    });

    const addRes = await storage.addTopic(
      topic,
      ctx.state.user,
      description,
      contentSchema,
    );
    ctx.response.status = Status.OK;
    ctx.response.body = JSON.stringify({
      existed: addRes.existed,
    });
  };
}