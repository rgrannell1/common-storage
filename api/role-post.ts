import { Status } from "../shared/status.ts";

import type {
  IAddActivity,
  IAddRole,
  IGetRole,
  SchemaValidator,
} from "../types/index.ts";
import { RequestPart } from "../types/index.ts";
import { BodyParsers } from "../services/parsers.ts";
import { PERMISSIONLESS_ROLE } from "../shared/constants.ts";

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

    if (ctx.params.role === PERMISSIONLESS_ROLE) {
      ctx.response.status = Status.UnprocessableEntity;
      ctx.response.body = JSON.stringify({
        error: `You may not modify ${PERMISSIONLESS_ROLE}`,
      });

      return;
    }

    const role = await storage.getRole(ctx.params.role);

    await storage.addRole(ctx.params.role, permissions);

    ctx.response.status = Status.OK;
    ctx.response.body = JSON.stringify({
      existed: role !== null,
    });
  };
}
