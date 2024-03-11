import type {
  Config,
  IAddUser,
  IGetRole,
  IGetUser,
  ILogger,
  SchemaValidator,
} from "../types/index.ts";
import { RequestPart } from "../types/index.ts";
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
    await logger.info("added user", ctx.request, { name, role: userData.role });

    ctx.response.status = Status.OK;
    ctx.response.body = JSON.stringify({
      name,
      role: userData.role,
      created: userData.created,
    });
  };
}
