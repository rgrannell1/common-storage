import { Status } from "../shared/status.ts";

import type {
  IAddActivity,
  IGetSubscription,
  IGetTopicStats,
  SchemaValidator,
} from "../types/index.ts";
import { RequestPart } from "../types/index.ts";
import { BodyParsers } from "../services/parsers.ts";

type Services = {
  storage: IGetSubscription & IGetTopicStats;
  logger: IAddActivity;
  schema: SchemaValidator;
};

type GetSubscriptionConfig = {};

export function getSubscription(_: GetSubscriptionConfig, services: Services) {
  const { storage, logger, schema } = services;

  return async function (ctx: any) {
    logger.addActivity({
      message: "starting request",
      request: ctx.request,
      metadata: {},
    });

    const body = await BodyParsers.json(ctx.request);

    schema("subscriptionGet", body, RequestPart.Body);
    schema("subscriptionGet", ctx.params, RequestPart.Params);

    await logger.addActivity({
      request: ctx.request,
      message: "getting subscription",
      metadata: {
        role: ctx.params.role,
      },
    });

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
      subscription,
      stats: topic.stats,
    });
  };
}
