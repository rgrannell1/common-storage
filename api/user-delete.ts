import { Status } from "../shared/status.ts";

import type {
  CSContext,
  IDeleteUser,
  IInfo,
  SchemaValidator,
} from "../types/index.ts";
import { RequestPart } from "../types/index.ts";
import { RoleInUseError } from "../shared/errors.ts";

type Services = {
  storage: IDeleteUser;
  logger: IInfo;
  schema: SchemaValidator;
};

type DeleteUserConfig = {};

export function deleteUser(_: DeleteUserConfig, services: Services) {
  const { storage, logger, schema } = services;

  return async function (ctx: CSContext) {
    schema("userDelete", ctx.params, RequestPart.Params);

    const { topic } = ctx.params;

    await logger.info("deleting topic", ctx.request, { topic });

    // TODO block deletion of subscription users

    try {
      const response = await storage.deleteUser(topic);
      ctx.response.status = Status.OK;
      ctx.response.body = JSON.stringify(response);
    } catch (err) {
      if (err instanceof RoleInUseError) {
        ctx.response.status = Status.Conflict;
        ctx.response.body = JSON.stringify({
          message: err.message,
        });
        return;
      }

      throw err;
    }
  };
}
