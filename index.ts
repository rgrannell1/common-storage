import { json, opine } from "https://deno.land/x/opine/mod.ts";

import { InMemoryStorage } from "./storage/in-memory.ts";
import { Config } from "./types.ts";
import * as services from "./services.ts";
import * as constants from "./constants.ts";
import routes from "./routes.ts";

const cfg = {
  title: "Common Storage",
  description: "Yo!",
  storage: new InMemoryStorage(),
  port: 8080,
};

const CommonStorage = (cfg: Config) => {
  const app = opine();

  setInterval(async () => {
    await services.retryNotification(cfg.storage);
  }, constants.RETRY_INTERVAL_MS);

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
    console.error("Common-Storage: listening on http://localhost:8080/");
  });
};

CommonStorage(cfg);
