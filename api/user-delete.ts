import { Status } from "https://deno.land/std/http/http_status.ts";

import type {
  CSContext,
  IAddActivity,
  IDeleteUser,
  SchemaValidator,
} from "../types.ts";
import { RequestPart } from "../types.ts";
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

    try {
      var response = await storage.deleteUser(topic);
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

    ctx.response.status = Status.OK;
    ctx.response.body = JSON.stringify(response);
  };
}
