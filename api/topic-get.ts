import { Status } from "../shared/status.ts";
import type {
  Config,
  IGetTopic,
  ILogger,
  SchemaValidator,
} from "../types/index.ts";
import { RequestPart } from "../types/index.ts";

type Services = {
  storage: IGetTopic;
  logger: ILogger;
  schema: SchemaValidator;
};

type GetTopicConfig = Partial<Config>;

export function getTopic(_: GetTopicConfig, services: Services) {
  const { storage, logger, schema } = services;

  return async function (ctx: any) {
    await logger.addActivity({
      request: ctx.request,
      message: "starting request",
      metadata: {},
    });

    schema("topicGet", ctx.params, RequestPart.Params);

    const { topic } = ctx.params;

    await logger.addActivity({
      request: ctx.request,
      message: "fetching topic",
      metadata: {
        topic,
      },
    });

    const topicData = await storage.getTopic(topic);
    if (!topicData) {
      ctx.response.status = Status.NotFound;
      ctx.response.body = JSON.stringify({
        error: `Topic "${topic}" does not exist`,
      });
      return;
    }

    ctx.response.status = Status.OK;
    ctx.response.body = JSON.stringify({
      name: topicData.name,
      description: topicData.description,
      created: topicData.created,
    });
  };
}
