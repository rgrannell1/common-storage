import { Status } from "../shared/status.ts";
import type {
  Config,
  CSContext,
  IAddActivity,
  IGetTopicNames,
  IGetTopicStats,
  SchemaValidator,
} from "../types/index.ts";

type Services = {
  storage: IGetTopicNames & IGetTopicStats;
  logger: IAddActivity;
  schema: SchemaValidator;
};

type GetFeedConfig = Partial<Config> & {
  description: string;
  title: string;
};

export function getFeed(cfg: GetFeedConfig, services: Services) {
  const { storage, logger } = services;

  return async function (ctx: CSContext) {
    await logger.addActivity({
      request: ctx.request,
      message: "starting request",
      metadata: {},
    });

    const topicNames = await storage.getTopicNames();
    const topics = await Promise.all(
      topicNames.map((topicName: string) => storage.getTopicStats(topicName)),
    );

    ctx.response.status = Status.OK;
    ctx.response.body = JSON.stringify({
      description: cfg.description,
      title: cfg.title,
      version: "v0.1",
      topics,
    });
  };
}
