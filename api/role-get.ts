import type {
  Config,
  IGetRole,
  ILogger,
  SchemaValidator,
} from "../types/index.ts";
import { RequestPart } from "../types/index.ts";
import { Status } from "../shared/status.ts";

type Services = {
  storage: IGetRole;
  logger: ILogger;
  schema: SchemaValidator;
};

type GetUserConfig = Partial<Config>;

export function getRole(_: GetUserConfig, services: Services) {
  const { storage, logger, schema } = services;

  return async function (ctx: any) {
    await logger.addActivity({
      request: ctx.request,
      message: "starting request",
      metadata: {},
    });

    schema("roleGet", ctx.params, RequestPart.Params);

    const role = ctx.params.role;
    const roleData = await storage.getRole(role);

    if (!roleData) {
      ctx.response.status = Status.NotFound;
      ctx.response.body = JSON.stringify({
        error: `Role "${role}" does not exist`,
      });
      return;
    }

    const { created, permissions } = roleData;

    ctx.response.status = Status.OK;
    ctx.response.body = JSON.stringify({
      name: role,
      created,
      permissions,
    });
  };
}
