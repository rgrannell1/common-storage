import {
  json,
  opine,
  OpineRequest,
  OpineResponse,
} from "https://deno.land/x/opine/mod.ts";

import { InMemoryStorage } from "./storage.ts";
import { Config, Routes } from "./types.ts";
import * as services from "./services.ts";
import * as constants from "./constants.ts";
import * as log from "https://deno.land/std@0.134.0/log/mod.ts";

const routes: Routes = {
  common: {},
  feed: {},
  subscriptions: {},
  subscription: {},
  topic: {},
  content: {},
  notify: {},
};

routes.common.auth = (_: Config) =>
  async (req: OpineRequest, res: OpineResponse, next: any) => {
    next();
  };

routes.feed.get = (cfg: Config) =>
  async (_: any, res: OpineResponse) => {
    const topicNames = await cfg.storage.getTopicNames();

    const topicStats = await Promise.all(
      topicNames.map(async (topicName: string) => {
        return await cfg.storage.getTopicStats(topicName);
      }),
    );

    res.send(JSON.stringify({
      type: "common-storage",
      version: "v0.1",
      topics: topicStats,
    }));
  };

routes.subscriptions.get = (cfg: Config) =>
  async (req: OpineRequest, res: OpineResponse) => {
    res.send(JSON.stringify({
      subscriptions: await cfg.storage.getSubscriptions(),
    }));
  };

routes.subscriptions.post = (cfg: Config) =>
  async (req: OpineRequest, res: OpineResponse) => {
    const { topic, hookUrl } = req.query;

    if (!topic) {
      res.status = 422;
      res.send(JSON.stringify({
        error: {
          message: "topic and URL must be defined.",
        },
      }));
      return;
    }
    if (!hookUrl) {
      res.status = 422;
      res.send(JSON.stringify({
        error: {
          message: "hookUrl must be defined.",
        },
      }));
      return;
    }

    try {
      new URL(hookUrl);
    } catch {
      res.status = 422;
      res.send(JSON.stringify({
        error: {
          message: "hookUrl must be a valid URL.",
        },
      }));
      return;
    }

    if (!await cfg.storage.getTopic(topic)) {
      res.status = 404;
      res.send(JSON.stringify({
        error: {
          message: `topic '${topic}' does not exist; cannot subscribe to it`,
        },
      }));
      return;
    }

    const id = await cfg.storage.addSubscription(topic, hookUrl);

    res.send(JSON.stringify({
      id,
    }));
  };

routes.subscription.post = (cfg: Config) =>
  async (req: OpineRequest, res: OpineResponse) => {
    const { id } = req.params;
    const { name, hookUrl } = req.query;

    try {
      new URL(hookUrl);
    } catch {
      res.status = 422;
      res.send(JSON.stringify({
        error: {
          message: "hookUrl must be a valid URL.",
        },
      }));
      return;
    }

    await cfg.storage.updateSubscription(id, name, hookUrl);

    res.send(JSON.stringify({}));
  };

routes.subscription.get = (cfg: Config) =>
  async (req: OpineRequest, res: OpineResponse) => {
    const { id } = req.params;
    const subscription = await cfg.storage.getSubscription(id);

    res.send(JSON.stringify({
      exist: subscription !== undefined,
      subscription: subscription ?? {},
    }));
  };

routes.subscription.delete = (cfg: Config) =>
  async (req: OpineRequest, res: OpineResponse) => {
    const { id } = req.params;
    await cfg.storage.deleteSubscription(id);

    res.send(JSON.stringify({}));
  };

routes.topic.post = (cfg: Config) =>
  async (req: OpineRequest, res: OpineResponse) => {
    const { id } = req.params;
    const existed = await cfg.storage.addTopic(id);

    res.send(JSON.stringify({
      existed,
    }));
  };

routes.topic.get = (cfg: Config) =>
  async (req: OpineRequest, res: OpineResponse) => {
    const { id } = req.params;

    if (!id) {
      res.status = 422;
      res.send(JSON.stringify({
        error: {
          message: "Topic id must be defined.",
        },
      }));
      return;
    }

    const topic = await cfg.storage.getTopic(id);

    res.send(JSON.stringify({
      exists: topic !== undefined,
      topic,
    }));
  };

routes.content.get = (cfg: Config) =>
  async (req: OpineRequest, res: OpineResponse) => {
    const { id } = req.params;
    const {
      lastId,
      compact = false,
      size = constants.DEFAULT_SIZE,
    } = req.query;

    const data = await cfg.storage.getContent(
      id,
      parseInt(lastId),
      parseInt(size),
    );

    res.send(JSON.stringify(data));
  };

routes.content.post = (cfg: Config) =>
  async (req: OpineRequest, res: OpineResponse) => {
    const { id } = req.params;

    const { batchId, events } = req.body;
    const finished = await cfg.storage.addContent(id, batchId, events);

    if (finished) {
      await services.sendNotification(cfg.storage, id);
    }

    res.send(JSON.stringify({
      batchId,
      topic: id,
      finished,
    }));
  };

routes.notify.post = (cfg: Config) =>
  async (req: OpineRequest, res: OpineResponse) => {
    const { subscriptionId, topic } = req.query;

    log.info({
      message: "POST notify/ received",
      subscriptionId,
      topic,
    });

    res.status = 200;
    res.send("OK");
  };

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
