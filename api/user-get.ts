import type {
  Config,
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
    const params = {
      ...ctx.params,
      human: ctx?.request?.url?.searchParams?.has("human"),
    };
    schema("userGet", params, RequestPart.Params);

    const { name, human } = ctx.params;

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
      created: human
        ? new Date(userData.created).toISOString()
        : userData.created,
    });
  };
}
