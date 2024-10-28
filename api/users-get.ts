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

export function getUsers(_: GetUserConfig, services: Services) {
  const { storage, logger, schema } = services;

  return async function (ctx: any) {
    const params = {
      ...ctx.params,
      human: ctx?.request?.url?.searchParams?.has("human"),
    };
    schema("usersGet", params, RequestPart.Params);

    const { human } = ctx.params;

    const userData = await storage.getUsers();

    ctx.response.status = Status.OK;
    ctx.response.body = JSON.stringify(userData.map((user) => {
      return {
        name: user.name,
        role: user.role,
        created: human ? new Date(user.created).toISOString() : user.created,
      };
    }));
  };
}
