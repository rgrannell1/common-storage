import Ajv from "https://esm.sh/ajv@8.12.0";
import { Status } from "./shared/status.ts";
import { Application, oakCors, Router } from "./deps.ts";
import { schema } from "./shared/schema.ts";

import { InputValidationError, JSONError } from "./shared/errors.ts";

import type { AppData, Config, Services } from "./types/index.ts";
import { RequestPart } from "./types/index.ts";
import { StorageLogger } from "./services/loggers/storage.ts";
import { ConsoleLogger } from "./services/loggers/console.ts";
import { CachedCommonStorage } from "./services/common-storage/cached.ts";
import { DenoKVBackend } from "./services/backends/deno-kv.ts";

import * as Authentication from "./api/authentication.ts";
import * as RateLimiting from "./api/rate-limit.ts";
import { getFeed } from "./api/feed-get.ts";
import { getUser } from "./api/user-get.ts";
import { getUsers } from "./api/users-get.ts";
import { postUser } from "./api/user-post.ts";
import { postRole } from "./api/role-post.ts";
import { getRole } from "./api/role-get.ts";
import { getContent } from "./api/content-get.ts";
import { postContent } from "./api/content-post.ts";
import { getTopic } from "./api/topic-get.ts";
import { postTopic } from "./api/topic-post.ts";
import { deleteTopic } from "./api/topic-delete.ts";
import { postSubscription } from "./api/subscription-post.ts";
import { notFound } from "./api/not-found.ts";

import { PERMISSIONLESS_ROLE } from "./shared/constants.ts";
import { Subscriptions } from "./services/subscriptions.ts";
import { IntertalkClient } from "./services/intertalk.ts";

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
      "/user",
      rateLimitMiddleware,
      adminMiddleware,
      getUsers(config, services) as any,
    )
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
    // ++ ++ SUBSCRIPTION
    .post(
      "/subscription/:topic",
      oakCors(),
      rateLimitMiddleware,
      adminMiddleware,
      postSubscription(config, services) as any,
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
  const defs = schema["$defs"];
  var subschema;

  if (part === RequestPart.Params) {
    subschema = defs.params[name];
  } else if (part === RequestPart.Body) {
    subschema = defs.body[name];
  } else {
    throw new Error(`Invalid request part: ${part}`);
  }

  if (!subschema || typeof subschema !== "object") {
    throw new Error(`Schema not found: ${name} (${part})`);
  }

  const valid = ajv.validate(subschema!, data);

  if (!valid) {
    const messages = (ajv.errors ?? []).map((err: any) => {
      return `- ${err.instancePath}: ${err.message}`;
    }).join("\n");
    let prelude = `Object was invalid for schema "${name}"`;
    if (part === RequestPart.Params) {
      prelude = "Request query-params were invalid";
    } else if (part === RequestPart.Body) {
      prelude = `Request-body was invalid for schema "${name}"`;
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

      await logger.error("Error while processing request", ctx.request, {
        error: err.message,
        stack: err.stack,
      });

      ctx.response.status = Status.InternalServerError;
      ctx.response.body = JSON.stringify({
        error: "Internal Server Error",
      });
    }
  };
}

/*
 * Preprocess the request; set request headers
 */
function preprocessRequest(services: Services) {
  const { logger } = services;

  return async (ctx: any, next: any) => {
    const { request, response } = ctx;

    request.state = {
      id: crypto.randomUUID(),
    };

    await logger.info("Request received", request, {});

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
  console.error(
    cfg.kvPath ? `Persisting to ${cfg.kvPath}` : `Persisting to memory`,
  );

  const backend = new DenoKVBackend(cfg.kvPath);
  const storage = new CachedCommonStorage(backend);
  await storage.init();

  // a special service-account role, for subscriptions.
  await storage.addRole(PERMISSIONLESS_ROLE, []);

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
    intertalk: IntertalkClient,
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
export function csApp(config: Config, services: Services): AppData {
  const router = csRouter(config, services);
  const app = new Application();

  app
    .use(errorHandler(config, services))
    .use(preprocessRequest(services))
    .use(router.routes())
    .use(router.allowedMethods())
    .use(notFound(config, services));

  if (config.canSubscribe) {
    // start a subscriptions client, so that we can poll
    const subscriptionClient = new Subscriptions(
      services.storage,
      services.logger,
      IntertalkClient,
    );
    const subscriptionsPid = subscriptionClient.startPoll();
    return { app, subscriptionsPid };
  } else {
    return { app };
  }
}

/*
 * Start the application
 *
 * @param app Application to start
 * @param config Application configuration
 *
 * @returns AbortController for the application
 */
export function startApp(appData: AppData, services: Services, config: Config) {
  const controller = new AbortController();

  const { app, subscriptionsPid } = appData;

  app.listen({
    port: config.port,
    signal: controller.signal,
  });

  controller.signal.onabort = async () => {
    if (subscriptionsPid) {
      clearInterval(subscriptionsPid);
    }

    await Promise.all([
      services.storage.close(),
      services.logger?.info("Common-Storage shutting down", undefined, {}),
    ]);
  };

  return controller;
}
