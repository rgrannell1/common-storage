import { Status } from "../shared/status.ts";
import type {
  Config,
  IAddContent,
  IGetTopic,
  IGetTopicStats,
  ILogger,
  SchemaValidator,
} from "../types/index.ts";
import { RequestPart } from "../types/index.ts";
import { BodyParsers } from "../services/parsers.ts";
import { TopicValidationError } from "../shared/errors.ts";
import { SUBSCRIPION_TOPIC_PREFIX } from "../shared/constants.ts";

type Services = {
  storage: IAddContent & IGetTopic & IGetTopicStats;
  logger: ILogger;
  schema: SchemaValidator;
};

type PostContentConfig = Partial<Config>;

export function postContent(_: PostContentConfig, services: Services) {
  const { storage, logger, schema } = services;

  return async function (ctx: any) {
    const body = await BodyParsers.json(ctx.request);

    schema("contentPost", body, RequestPart.Body);
    schema("contentPost", ctx.params, RequestPart.Params);

    const topic = ctx?.params?.topic;

    const { batchId, content } = body;

    // special handling for subscription topics
    if (topic.startsWith(SUBSCRIPION_TOPIC_PREFIX)) {
      ctx.response.status = Status.UnprocessableEntity;
      ctx.response.body = JSON.stringify({
        error:
          "Cannot post content to topics prefixed 'subscription.', as these topics are reserved as subscription targets",
      });
      return;
    }

    await logger.info("checking topic exists", ctx.request, { topic });

    if (!await storage.getTopic(topic)) {
      ctx.response.status = Status.NotFound;
      ctx.response.body = JSON.stringify({
        error: `Topic "${topic}" does not exist`,
      });
      return;
    }

    try {
      await storage.addContent(batchId, topic, content);
    } catch (err) {
      if (err instanceof TopicValidationError) {
        await logger.info("content invalid", ctx.request, { topic });

        ctx.response.status = Status.UnprocessableEntity;
        ctx.response.body = JSON.stringify({
          error: err.message,
        });
        return;
      }

      await logger.info("failed to add content", ctx.request, {
        topic,
        message: err.message,
        stack: err.stack,
      });

      ctx.response.status = Status.InternalServerError;
      ctx.response.body = JSON.stringify({
        error: "an exception occurred while validating content: " + err.message,
      });
      return;
    }

    await logger.info("getting topic stats", ctx.request, {
      topic,
    });

    const stats = await storage.getTopicStats(topic);

    ctx.response.status = Status.OK;
    ctx.response.body = JSON.stringify({
      batch: {
        id: batchId,
        status: content.length === 0 ? "closed" : "open",
      },
      topic,
      stats,
    });
  };
}
