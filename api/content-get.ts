import { Status } from "../shared/status.ts";
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

    const params = {
      ...ctx.params,
      startId: ctx.request.url.searchParams.get('startId')
    }
    schema("contentGet", params, RequestPart.Params);

    const { startId, topic } = params;
    const parsedStartId = typeof startId === "string"
      ? parseInt(startId, 10)
      : startId;

    await logger.addActivity({
      request: ctx.request,
      message: "getting content",
      metadata: {
        topic,
      },
    });

    const content = await storage.getContent(topic, parsedStartId);

    ctx.response.status = Status.OK;
    ctx.response.body = JSON.stringify(content);
  };
}
