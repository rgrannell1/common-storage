import { Status } from "../shared/status.ts";

import type {
  CSContext,
  IAddActivity,
  IDeleteUser,
  SchemaValidator,
} from "../types/index.ts";
import { RequestPart } from "../types/index.ts";
import { RoleInUseError } from "../shared/errors.ts";

type Services = {
  storage: IDeleteUser;
  logger: IAddActivity;
  schema: SchemaValidator;
};

type DeleteUserConfig = {};

export function deleteUser(_: DeleteUserConfig, services: Services) {
  const { storage, logger, schema } = services;

  return async function (ctx: CSContext) {
    logger.addActivity({
      message: "starting request",
      request: ctx.request,
      metadata: {},
    });

    schema("userDelete", ctx.params, RequestPart.Params);

    const topic = ctx.params.topic;

    await logger.addActivity({
      request: ctx.request,
      message: "deleting topic",
      metadata: {
        topic,
      },
    });

    // TODO block deletion of subscription users

    try {
      const response = await storage.deleteUser(topic);
      ctx.response.status = Status.OK;
      ctx.response.body = JSON.stringify(response);
    } catch (err) {
      if (err instanceof RoleInUseError) {
        ctx.response.status = Status.Conflict;
        ctx.response.body = JSON.stringify({
          message: err.message,
        });
        return;
      }

      throw err;
    }
  };
}
