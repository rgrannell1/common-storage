import { json, opine } from "https://deno.land/x/opine/mod.ts";

import { Config } from "../types.ts";
import routes from "./routes.ts";
import config from '../config.ts';

const CommonStorage = (cfg: Config) => {
  const app = opine();

  app.use(routes.common.auth(cfg));
  app.use(json());

  app.get("/feed", routes.feed.get(cfg));
  app.get("/subscription", routes.subscriptions.get(cfg));
  app.post("/subscription", routes.subscriptions.post(cfg));
  app.post("/subscription/:id", routes.subscription.post(cfg));
  app.get("/subscription/:id", routes.subscription.get(cfg));
  app.delete("/subscription/:id", routes.subscription.delete(cfg));
  app.post("/topic/:id", routes.topic.post(cfg));
  app.get("/topic/:id", routes.topic.get(cfg));

  app.get("/content/:id", routes.content.get(cfg));
  app.post("/content/:id", routes.content.post(cfg));
  app.post("/notify", routes.notify.post(cfg));

  app.listen(cfg.port, () => {
    console.error(`Common-Storage: listening on http://localhost:${cfg.port}/`);
  });
};

CommonStorage(config);
