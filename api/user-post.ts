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
import { BodyParsers } from "../services/parsers.ts";

type Services = {
  storage: IAddUser & IGetUser & IGetRole;
  logger: ILogger;
  schema: SchemaValidator;
};

type PostUserConfig = Partial<Config>;

export function postUser(_: PostUserConfig, services: Services) {
  const { storage, logger, schema } = services;

  return async function (ctx: any) {
    const body = await BodyParsers.json(ctx.request);

    schema("userPost", ctx.params, RequestPart.Params);
    schema("userPost", body, RequestPart.Body);

    const name = ctx.params.name;
    const { role, password } = body;

    await logger.info("checking role status", ctx.request, { name, role });

    if (!await storage.getRole(role)) {
      ctx.response.status = Status.NotFound;
      ctx.response.body = JSON.stringify({
        error: `Role "${role}" does not exist`,
      });
      return;
    }

    const addRes = await storage.addUser(name, role, password);

    await logger.info("added user", ctx.request, { name, role });

    ctx.response.status = Status.OK;
    ctx.response.body = JSON.stringify(addRes);
  };
}
