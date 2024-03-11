import { Status } from "../shared/status.ts";
import type {
  Config,
  CSContext,
  IError,
  IGetSubscriptions,
  IGetTopicNames,
  IGetTopicStats,
  IInfo,
  SchemaValidator,
} from "../types/index.ts";

type Services = {
  storage: IGetTopicNames & IGetTopicStats & IGetSubscriptions;
  logger: IInfo & IError;
  schema: SchemaValidator;
};

type GetFeedConfig = Partial<Config> & {
  description: string;
  title: string;
};

export function getFeed(cfg: GetFeedConfig, services: Services) {
  const { storage, logger } = services;

  return async function (ctx: CSContext) {
    const topicNames = await storage.getTopicNames();

    const topicsPromises = Promise.all(
      topicNames.map((topicName: string) => storage.getTopicStats(topicName)),
    );
    const subscriptionsPromises = Array.fromAsync(storage.getSubscriptions());

    const [topics, subscriptions] = await Promise.all([
      topicsPromises,
      subscriptionsPromises,
    ]);

    const subscriptionMap: Record<string, { source: string }> = {};
    for (const sub of subscriptions) {
      subscriptionMap[sub.target] = {
        source: sub.source,
      };
    }

    ctx.response.status = Status.OK;
    ctx.response.body = JSON.stringify({
      description: cfg.description,
      title: cfg.title,
      version: "v0.1",
      topics,
      subscriptions: subscriptionMap,
    });
  };
}
