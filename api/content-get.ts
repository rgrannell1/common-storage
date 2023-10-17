import { Status } from "https://deno.land/std/http/http_status.ts";
import type {
  Config,
  IGetContent,
  IGetTopic,
  ILogger,
  SchemaValidator,
} from "../types.ts";
import { RequestPart } from "../types.ts";

type Services = {
  storage: IGetTopic & IGetContent;
  logger: ILogger;
  schema: SchemaValidator;
};

type GetContentConfig = Partial<Config>;

export function getContent(_: GetContentConfig, services: Services) {
  const { storage, logger, schema } = services;

  return async function (ctx: any) {
    await logger.addActivity({
      request: ctx.request,
      message: "starting request",
      metadata: {},
    });

    schema("contentGet", ctx.params, RequestPart.Params);

    const { startId, topic } = ctx?.params;

    await logger.addActivity({
      request: ctx.request,
      message: "getting content",
      metadata: {
        topic,
      },
    });

    const content = await storage.getContent(topic, startId);

    ctx.response.status = Status.OK;
    ctx.response.body = JSON.stringify(content);
  };
}
