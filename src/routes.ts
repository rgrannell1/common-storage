routes.subscriptions.post = (cfg: Config) =>
  async (req: OpineRequest, res: OpineResponse) => {
    const { topic, hookUrl } = req.query;

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

export default routes;
