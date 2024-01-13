import { Status } from "../shared/status.ts";

import type { Config, ILogger, SchemaValidator } from "../types.ts";

type Services = {
  storage: {};
  logger: ILogger;
  schema: SchemaValidator;
};

type NotFoundConfig = Partial<Config>;

/*
 * A simple 404 handler
 */
export function notFound(cfg: NotFoundConfig, services: Services) {
  const { logger } = services;

  return async function (ctx: any) {
    await logger.addActivity({
      request: ctx.request,
      message: "unknown route requested",
      metadata: {},
    });

    ctx.response.status = Status.NotFound;
    ctx.response.body = JSON.stringify({
      error: "Not Found",
    });
  };
}
