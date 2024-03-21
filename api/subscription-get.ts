import { Status } from "../shared/status.ts";

import type {
  IGetSubscription,
  IGetTopicStats,
  ILogger,
  SchemaValidator,
} from "../types/index.ts";
import { RequestPart } from "../types/index.ts";
import { BodyParsers } from "../services/parsers.ts";

type Services = {
  storage: IGetSubscription & IGetTopicStats;
  schema: SchemaValidator;
};

type GetSubscriptionConfig = {};

export function getSubscription(_: GetSubscriptionConfig, services: Services) {
  const { storage, schema } = services;

  return async function (ctx: any) {
    const body = await BodyParsers.json(ctx.request);

    const params = {
      ...ctx.params,
      human: ctx?.request?.url?.searchParams?.has("human"),
    };
    schema("subscriptionGet", body, RequestPart.Body);
    schema("subscriptionGet", params, RequestPart.Params);

    const subscription = await storage.getSubscription(ctx.params.topic);
    if (!subscription) {
      ctx.response.status = Status.NotFound;
      ctx.response.body = JSON.stringify({
        error: `Subscription not found for topic ${ctx.params.topic}`,
      });

      return;
    }

    const topic = await storage.getTopicStats(ctx.params.topic);
    if (!topic) {
      ctx.response.status = Status.NotFound;
      ctx.response.body = JSON.stringify({
        error: `Topic not found for subscription ${ctx.params.topic}`,
      });

      return;
    }

    ctx.response.status = Status.OK;
    ctx.response.body = JSON.stringify({
      subscription: {
        ...subscription,
        created: params.human ? new Date(subscription.created) : subscription.created,
      },
      stats: topic.stats,
    });
  };
}
