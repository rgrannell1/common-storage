import { Status } from "../shared/status.ts";

import type { IAddActivity, IDeleteTopic, SchemaValidator } from "../types/index.ts";
import { RequestPart } from "../types/index.ts";

type Services = {
  storage: IDeleteTopic;
  logger: IAddActivity;
  schema: SchemaValidator;
};

type DeleteTopicConfig = {};

export function deleteTopic(_: DeleteTopicConfig, services: Services) {
  const { storage, logger, schema } = services;

  return async function (ctx: any) {
    logger.addActivity({
      message: "starting request",
      request: ctx.request,
      metadata: {},
    });

    schema("topicDelete", ctx.params, RequestPart.Params);

    const topic = ctx.params.topic;

    await logger.addActivity({
      request: ctx.request,
      message: "deleting topic",
      metadata: {
        topic,
      },
    });

    const response = await storage.deleteTopic(topic);

    ctx.response.status = Status.OK;
    ctx.response.body = JSON.stringify(response);
  };
}
