import Ajv from "https://esm.sh/ajv@8.12.0";
import { Status } from "./shared/status.ts";
import { Application, Router } from "https://deno.land/x/oak@v12.6.2/mod.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";

import schema from "./schema.json" assert { type: "json" };

import { InputValidationError, JSONError } from "./shared/errors.ts";

import type { Config, Services } from "./types/index.ts";
import { RequestPart } from "./types/index.ts";
import { StorageLogger } from "./services/storage-logger.ts";
import { ConsoleLogger } from "./services/console-logger.ts";
import { CommonStorage } from "./services/common-storage.ts";
import { DenoKVBackend } from "./services/storage-backend.ts";

import * as Authentication from "./api/authentication.ts";
import * as RateLimiting from "./api/rate-limit.ts";
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

export function csRouter(config: Config, services: Services) {
  // ++ combined router
  const router = new Router();

  const adminMiddleware = Authentication.adminAccess(config, services) as any;
  const roleMiddleware = Authentication.roleAccess(config, services) as any;

  const rateLimitMiddleware = RateLimiting.rateLimit(config, services) as any;

  router
    .options(
      "/(.*)",
      oakCors(),
    )
    // ++ require admin auth for user management routes
    //
    // ++ ++ USER
    .get(
      "/user/:name",
      rateLimitMiddleware,
      adminMiddleware,
      getUser(config, services) as any,
    )
    .post(
      "/user/:name",
      rateLimitMiddleware,
      adminMiddleware,
      postUser(config, services) as any,
    )
    //
    // ++ ++ ROLE
    .get(
      "/role/:role",
      rateLimitMiddleware,
      adminMiddleware,
      getRole(config, services) as any,
    )
    .post(
      "/role/:role",
      rateLimitMiddleware,
      adminMiddleware,
      postRole(config, services) as any,
    )
    // ++ allow any unauthorized user
    //
    // ++ ++ FEED
    .get(
      "/feed",
      oakCors(),
      rateLimitMiddleware,
      getFeed(config, services) as any,
    )
    // ++ require role-based auth for content and topic routes
    //
    // ++ ++ CONTENT
    .get(
      "/content/:topic",
      oakCors(),
      rateLimitMiddleware,
      roleMiddleware,
      getContent(config, services) as any,
    )
    .post(
      "/content/:topic",
      oakCors(),
      rateLimitMiddleware,
      roleMiddleware,
      postContent(config, services) as any,
    )
    //
    // ++ ++ TOPIC
    .get(
      "/topic/:topic",
      oakCors(),
      rateLimitMiddleware,
      roleMiddleware,
      getTopic(config, services) as any,
    )
    .post(
      "/topic/:topic",
      oakCors(),
      rateLimitMiddleware,
      roleMiddleware,
      postTopic(config, services) as any,
    )
    .delete(
      "/topic/:topic",
      oakCors(),
      rateLimitMiddleware,
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
      } else if (err instanceof JSONError) {
        ctx.response.status = Status.BadRequest;
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

    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Content-Type", "application/json; charset=utf-8");
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("X-XSS-Protection", "1; mode=block");
    response.headers.set("Referrer-Policy", "no-referrer");

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
  const backend = new DenoKVBackend(cfg.kvPath);
  const storage = new CommonStorage(backend);
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

/*
 * Construct the common-storage application
 *
 * @params config Application configuration
 * @params services Application services
 *
 * @returns The application
 */
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

/*
 * Start the application
 *
 * @param app Application to start
 * @param config Application configuration
 *
 * @returns AbortController for the application
 */
export function startApp(app: Application, config: Config) {
  const controller = new AbortController();

  app.listen({
    port: config.port,
    signal: controller.signal,
  });

  return controller;
}
