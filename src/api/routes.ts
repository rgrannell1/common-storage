import { OpineRequest, OpineResponse } from "https://deno.land/x/opine/mod.ts";

import { Config, Routes } from "../types.ts";
import * as services from "../services.ts";
import * as constants from "../constants.ts";
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

routes.common.auth = (cfg: Config) =>
  async (req: OpineRequest, res: OpineResponse, next: any) => {
    const auth = req.headers.get("Authorization");

    if (auth) {
      const hasCredentials = auth.match(/^Basic\s+(.*)$/i);

      if (hasCredentials) {
        const [user, password] = atob(hasCredentials[1]).split(":");
        const valid = user === cfg.user.name && password === cfg.user.password;

        // just to ensure credentials are actually present...
        if (valid && user && password) {
          return next();
        }
      }
    }

    res.status = 401;
    res.send(JSON.stringify({
      error: {
        message: "Not authorized",
      },
    }));
  };

routes.common.headers = (cfg: Config) =>
  async (req: OpineRequest, res: OpineResponse, next: any) => {
    const headers = new Headers();
    headers.set("Content-Type", "application/json; charset=utf-8");

    res.headers = headers;

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
      description: cfg.description,
      title: cfg.title,
      type: "common-storage",
      version: "v0.1",
      topics: topicStats,
    }));
  };

routes.subscriptions.get = (cfg: Config) =>
  async (_: OpineRequest, res: OpineResponse) => {
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
    const { finished } = await cfg.storage.addContent(id, batchId, events);

    if (finished) {
      await services.notifySubscriptions(cfg.storage, id);
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

export default routes;
