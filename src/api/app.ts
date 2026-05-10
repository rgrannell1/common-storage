// Hono app setup — middleware registration and route binding
// @design.md

import { Hono } from "hono";
import { cors } from "hono/cors";
import { registerRoutes } from "./routes/router.ts";
import { getFeedRoute } from "./routes/get-feed.ts";
import type { IGetTopicNames, IGetTopicStats, IGetSubscriptions } from "./storage/capabilities.ts";

export type AppDeps = {
  storage: IGetTopicNames & IGetTopicStats & IGetSubscriptions;
};

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.use("*", cors());

  registerRoutes(app, [
    { method: "GET", path: "/feed", route: getFeedRoute(deps) },
  ]);

  return app;
}
