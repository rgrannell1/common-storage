import { Status } from "../shared/status.ts";

import type {
  IDeleteTopic,
  SchemaValidator,
  IInfo,
  IError
} from "../types/index.ts";
import { RequestPart } from "../types/index.ts";

type Services = {
  storage: IDeleteTopic;
  logger: IInfo & IError;
  schema: SchemaValidator;
};

type DeleteTopicConfig = Record<string, unknown>;

export function deleteTopic(_: DeleteTopicConfig, services: Services) {
  const { storage, logger, schema } = services;

  return async function (ctx: any) {
    schema("topicDelete", ctx.params, RequestPart.Params);

    const topic = ctx.params.topic;

    await logger.info("deleting topic", ctx.request, { topic });

    const response = await storage.deleteTopic(topic);

    ctx.response.status = Status.OK;
    ctx.response.body = JSON.stringify(response);
  };
}
