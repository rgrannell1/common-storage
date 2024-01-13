import type {
  Config,
  IAddUser,
  IGetRole,
  IGetUser,
  ILogger,
  SchemaValidator,
} from "../types.ts";
import { RequestPart } from "../types.ts";
import { Status } from "../shared/status.ts";

type Services = {
  storage: IGetUser & IGetRole;
  logger: ILogger;
  schema: SchemaValidator;
};

type GetUserConfig = Partial<Config>;

export function getUser(_: GetUserConfig, services: Services) {
  const { storage, logger, schema } = services;

  return async function (ctx: any) {
    await logger.addActivity({
      request: ctx.request,
      message: "starting request",
      metadata: {},
    });

    schema("userGet", ctx.params, RequestPart.Params);

    const name = ctx.params.name;

    const userData = await storage.getUser(name);
    if (!userData) {
      ctx.response.status = Status.NotFound;
      ctx.response.body = JSON.stringify({
        error: `User "${name}" does not exist`,
      });
      return;
    }

    if (!await storage.getRole(userData.role)) {
      ctx.response.status = Status.NotFound;
      ctx.response.body = JSON.stringify({
        error: `Role "${userData.role}" does not exist`,
      });
      return;
    }

    await logger.addActivity({
      request: ctx.request,
      message: "added user",
      metadata: {
        name,
        role: userData.role,
      },
    });

    ctx.response.status = Status.OK;
    ctx.response.body = JSON.stringify({
      name,
      role: userData.role,
      created: userData.created,
    });
  };
}
