import { Status } from "../shared/status.ts";

import type {
  IAddActivity,
  IAddRole,
  IGetRole,
  SchemaValidator,
} from "../types.ts";
import { RequestPart } from "../types.ts";
import { BodyParsers } from "../services/parsers.ts";

type Services = {
  storage: IGetRole & IAddRole;
  logger: IAddActivity;
  schema: SchemaValidator;
};

type PostRoleConfig = {};

export function postRole(_: PostRoleConfig, services: Services) {
  const { storage, logger, schema } = services;

  return async function (ctx: any) {
    logger.addActivity({
      message: "starting request",
      request: ctx.request,
      metadata: {},
    });

    const body = await BodyParsers.json(ctx.request);

    schema("rolePost", body, RequestPart.Body);
    schema("rolePost", ctx.params, RequestPart.Params);

    const { permissions } = body;

    await logger.addActivity({
      request: ctx.request,
      message: "adding role",
      metadata: {
        role: ctx.params.role,
      },
    });

    const role = await storage.getRole(ctx.params.role);

    await storage.addRole(ctx.params.role, permissions);

    ctx.response.status = Status.OK;
    ctx.response.body = JSON.stringify({
      existed: role !== null,
    });
  };
}
