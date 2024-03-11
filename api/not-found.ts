import { Status } from "../shared/status.ts";

import type { Config, ILogger, SchemaValidator } from "../types/index.ts";

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
    await logger.error("unknown route", ctx.request, {});

    ctx.response.status = Status.NotFound;
    ctx.response.body = JSON.stringify({
      error: "Not Found",
    });
  };
}
