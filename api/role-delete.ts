import { Status } from "../shared/status.ts";

import type {
  CSContext,
  IDeleteRole,
  SchemaValidator,
} from "../types/index.ts";
import { RequestPart } from "../types/index.ts";

type Services = {
  storage: IDeleteRole;
  logger: {};
  schema: SchemaValidator;
};

type DeleteRoleConfig = {};

export function deleteRole(_: DeleteRoleConfig, services: Services) {
  const { storage, schema } = services;

  return async function (ctx: CSContext) {
    schema("roleDelete", ctx.params, RequestPart.Params);

    const { role } = ctx.params as { role: string };
    const response = await storage.deleteRole(role);

    ctx.response.status = Status.OK;
    ctx.response.body = JSON.stringify(response);
  };
}
