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
  const { storage, schema } = services;

  return async function (ctx: any) {
    const params = {
      ...ctx.params,
      human: ctx?.request?.url?.searchParams?.has("human"),
    };
    schema("roleGet", params, RequestPart.Params);

    const { role, human } = params;
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
      created: human ? new Date(created).toISOString() : created,
      permissions,
    });
  };
}
