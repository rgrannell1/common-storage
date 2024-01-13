import Ajv from "https://esm.sh/ajv";
import { Status } from "https://deno.land/std/http/http_status.ts";
import { Application, Router } from "https://deno.land/x/oak/mod.ts";
import { oakCors } from "https://deno.land/x/cors/mod.ts";

import schema from "./schema.json" assert { type: "json" };

import { InputValidationError } from "./shared/errors.ts";

import type { Config, ILogger } from "./types.ts";
import { RequestPart } from "./types.ts";
import { StorageLogger } from "./services/storage-logger.ts";
import { ConsoleLogger } from "./services/console-logger.ts";
import { KVStorage } from "./services/kv-storage.ts";

import * as Authentication from "./api/authentication.ts";
import { getFeed } from "./api/feed-get.ts";
import { getUser } from "./api/user-get.ts";
import { postUser } from "./api/user-post.ts";
import { postRole } from "./api/role-post.ts";
import { getRole } from "./api/role-get.ts";
import { getContent } from "./api/content-get.ts";
import { postContent } from "./api/content-post.ts";
import { getTopic } from "./api/topic-get.ts";
import { postTopic } from "./api/topic-post.ts";
import { deleteTopic } from "./api/topic-delete.ts";
import { notFound } from "./api/not-found.ts";

const ajv = new Ajv({ allErrors: true });

type Services = {
  storage: any;
  logger: ILogger;
  schema: any;
};

export function csRouter(config: Config, services: Services) {
  // ++ combined router
  const router = new Router();

  const adminMiddleware = Authentication.adminAccess(config, services) as any;
  const roleMiddleware = Authentication.roleAccess(config, services) as any;

  router
    .options(
      "/(.*)",
      oakCors())
    // ++ require admin auth for user management routes
    //
    // ++ ++ USER
    .get(
      "/user/:name",
      adminMiddleware,
      getUser(config, services) as any)
    .post(
      "/user/:name",
      adminMiddleware,
      postUser(config, services) as any)
    //
    // ++ ++ ROLE
    .get(
      "/role/:role",
      adminMiddleware,
      getRole(config, services) as any)
    .post(
      "/role/:role",
      adminMiddleware,
      postRole(config, services) as any)
    // ++ allow any unauthorized user
    //
    // ++ ++ FEED
    .get(
      "/feed",
      oakCors(),
      getFeed(config, services) as any)
    // ++ require role-based auth for content and topic routes
    //
    // ++ ++ CONTENT
    .get(
      "/content/:topic",
      oakCors(),
      roleMiddleware,
      getContent(config, services) as any,
    )
    .post(
      "/content/:topic",
      oakCors(),
      roleMiddleware,
      postContent(config, services) as any,
    )
    //
    // ++ ++ TOPIC
    .get(
      "/topic/:topic",
      oakCors(),
      roleMiddleware,
      getTopic(config, services) as any)
    .post(
      "/topic/:topic",
      oakCors(),
      roleMiddleware,
      postTopic(config, services) as any)
    .delete(
      "/topic/:topic",
      oakCors(),
      roleMiddleware,
      deleteTopic(config, services) as any,
    );

  return router;
}

/*
 * Validate a request body or params against the schema.
 *
 * @param name Name of the schema to validate against
 * @param data Data to validate
 * @param part Part of the request to validate
 */
export function validateSchema<T>(
  name: string,
  data: T,
  part: RequestPart = RequestPart.Body,
) {
  const defs = schema["$defs"] as any;
  var subschema;

  if (part === RequestPart.Params) {
    subschema = defs["params"][name];
  } else if (part === RequestPart.Body) {
    subschema = defs["body"][name];
  } else {
    throw new Error(`Invalid request part: ${part}`);
  }

  const valid = ajv.validate(subschema!, data);

  if (!valid) {
    const messages = (ajv.errors ?? []).map((err: any) => {
      return `- ${err.instancePath}: ${err.message}`;
    }).join("\n");
    let prelude = "Object was invalid";
    if (part === RequestPart.Params) {
      prelude = "Request query-params were invalid";
    } else if (part === RequestPart.Body) {
      prelude = "Request-body was invalid";
    }

    throw new InputValidationError(`${prelude}:\n${messages}`);
  }
}

/*
 * Invoke REST routes through this middleware. If an error occurs
 * during the route, it will be caught and logged.
 *
 * @param config Application configuration
 * @param services Application services
 */
function errorHandler(_: Config, services: Services) {
  const { logger } = services;

  return async (ctx: any, next: any) => {
    try {
      await next();
    } catch (err) {
      if (err instanceof InputValidationError) {
        ctx.response.status = Status.UnprocessableEntity;
        ctx.response.body = JSON.stringify({
          error: err.message,
        });

        return;
      }

      ctx.response.status = Status.InternalServerError;
      ctx.response.body = JSON.stringify({
        error: "Internal Server Error",
      });

      await logger.addException(err);
    }
  };
}

/*
 * Preprocess the request; set request headers
 */
function preprocessRequest() {
  return async (ctx: any, next: any) => {
    const { request, response } = ctx;

    request.state = {
      id: crypto.randomUUID(),
    };

    response.headers.set("Content-Type", "application/json; charset=utf-8");

    await next(ctx);
  };
}

/*
 * Create the application services. This includes singleton instances like
 * the storage-client or logger.
 *
 * @param config Application configuration
 */
export async function csServices(cfg: Config): Promise<Services> {
  const storage = new KVStorage(undefined);
  await storage.init();

  let logger;

  if (cfg.logger === "console") {
    logger = new ConsoleLogger(storage);
  } else if (cfg.logger === "storage") {
    logger = new StorageLogger(storage);
  } else {
    throw new Error(`Invalid logger: ${cfg.logger}`);
  }

  return {
    storage,
    logger,
    schema: validateSchema,
  };
}

export function csApp(config: Config, services: Services): Application {
  const router = csRouter(config, services);
  const app = new Application();

  app
    .use(errorHandler(config, services))
    .use(preprocessRequest())
    .use(router.routes())
    .use(router.allowedMethods())
    .use(notFound(config, services));

  return app;
}

export async function startApp(app: Application, config: Config) {
  const controller = new AbortController();

  app.listen({
    port: config.port,
    signal: controller.signal,
  });

  return controller;
}