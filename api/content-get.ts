import { Status } from "../shared/status.ts";
import type {
  Config,
  IGetAllContent,
  IGetContent,
  IGetTopic,
  ILogger,
  SchemaValidator,
} from "../types/index.ts";
import { RequestPart } from "../types/index.ts";
import { ParamsParsers } from "../services/parsers.ts";
import { ServerSentEvent } from "https://deno.land/x/oak@v12.6.2/deps.ts";

type Services = {
  storage: IGetTopic & IGetContent & IGetAllContent;
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
      size: ctx.request.url.searchParams.get("size"),
    };
    schema("contentGet", params, RequestPart.Params);

    const { startId, size, topic } = params;
    await logger.info("getting content", ctx.request, { topic });

    // special handling for server-sent events
    if (ctx.request.accepts("text/event-stream")) {
      const tgt = ctx.sendEvents();

      for await (const content of storage.getAllContent(params.topic, startId)) {
        tgt.dispatchEvent(new ServerSentEvent("content", {data: content}));
      }

      await tgt.close();
      return;
    }

    // normal `application/json` handling
    const content = await storage.getContent(
      topic,
      ParamsParsers.startId(startId),
      size
    );

    ctx.response.status = Status.OK;
    ctx.response.body = JSON.stringify(content);
  };
}
