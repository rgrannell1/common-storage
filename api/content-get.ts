import { Status } from "../shared/status.ts";
import type {
  Config,
  IGetContent,
  IGetTopic,
  ILogger,
  SchemaValidator,
} from "../types/index.ts";
import { RequestPart } from "../types/index.ts";
import { ParamsParsers } from "../services/parsers.ts";

type Services = {
  storage: IGetTopic & IGetContent;
  logger: ILogger;
  schema: SchemaValidator;
};

type GetContentConfig = Partial<Config>;

export function getContent(_: GetContentConfig, services: Services) {
  const { storage, logger, schema } = services;

  return async function (ctx: any) {
    const params = {
      ...ctx.params,
      startId: ctx.request.url.searchParams.get("startId"),
    };
    schema("contentGet", params, RequestPart.Params);

    const { startId, topic } = params;
    await logger.info("getting content", ctx.request, {topic});

    const content = await storage.getContent(
      topic,
      ParamsParsers.startId(startId),
    );

    ctx.response.status = Status.OK;
    ctx.response.body = JSON.stringify(content);
  };
}
