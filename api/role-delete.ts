import { Status } from "https://deno.land/std/http/http_status.ts";

import type {
  CSContext,
  IAddActivity,
  IDeleteRole,
  SchemaValidator,
} from "../types.ts";
import { RequestPart } from "../types.ts";

type Services = {
  storage: IDeleteRole;
  logger: IAddActivity;
  schema: SchemaValidator;
};

type DeleteRoleConfig = {};

export function deleteRole(_: DeleteRoleConfig, services: Services) {
  const { storage, logger, schema } = services;

  return async function (ctx: CSContext) {
    logger.addActivity({
      message: "starting request",
      request: ctx.request,
      metadata: {},
    });

    schema("roleDelete", ctx.params, RequestPart.Params);

    const topic = ctx.params.topic;

    await logger.addActivity({
      request: ctx.request,
      message: "deleting topic",
      metadata: {
        topic,
      },
    });

    const response = await storage.deleteRole(topic);

    ctx.response.status = Status.OK;
    ctx.response.body = JSON.stringify(response);
  };
}