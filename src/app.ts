import { json, opine } from "https://deno.land/x/opine/mod.ts";

import { IConfig } from "./types/interfaces/config.ts";
import { feedGet } from "./api/feed/feed-get.ts";
import { topicGet } from "./api/topic/topic-get.ts";
import { topicPost } from "./api/topic/topic-post.ts";
import { topicDelete } from "./api/topic/topic-delete.ts";
import { contentPost } from "./api/content/content-post.ts";
import { contentGet } from "./api/content/content-get.ts";
import { subscriptionPost } from "./api/subscription/subscription-post.ts";
import { subscriptionGet } from "./api/subscription/subscription-get.ts";

import { authorised } from "./api/authorised.ts";
import { setHeaders } from "./api/set-headers.ts";
import { logRoutes } from "./api/log-routes.ts";
import { opineCors } from "https://deno.land/x/cors/mod.ts";

function motd(cfg: IConfig) {
  console.log([
    "Common-Storage",
    "",
    `http://localhost:${cfg.port}`,
  ].join("\n"));
}

export class CommonStorage {
  config: IConfig;
  pollSubscriptionPid?: number;

  constructor(config: IConfig) {
    this.config = config;
  }

  async launch(listen: boolean) {
    const app = opine();
    const cfg = this.config;

    app.use(logRoutes(cfg));
    app.use(json(cfg));

    // -- cors options route for post preflight requests
    app.options("/*", opineCors());

    //
    app.use(authorised(cfg));
    app.use(setHeaders(cfg));

    // -- feed routes
    app.get("/feed", feedGet(cfg));

    // -- topic routes
    app.get("/topic/:name", topicGet(cfg));
    app.post("/topic/:name", topicPost(cfg));
    app.delete("/topic/:name", topicDelete(cfg));

    // -- content routes
    app.post("/content/:topic", opineCors(), contentPost(cfg));
    app.get("/content/:topic", contentGet(cfg));

    // -- subscription routes
    app.post("/subscription", subscriptionPost(cfg));
    app.get("/subscription", subscriptionGet(cfg));

    const port = cfg.port;

    if (listen) {
      app.listen(port, () => {
        motd(cfg);
      });
    }

    await cfg.storage.init();

    this.pollSubscriptions(cfg);

    return app;
  }

  static async overdue(cfg: IConfig, id: string): boolean {
    // get subscription information
    try {
      var stats = await cfg.storage.getSubscriptionStats(id);
    } catch (getInfoErr) {
      cfg.logger.error("failed to retrieve subscription information", {
        id,
        error: {
          stack: getInfoErr.stack,
          message: getInfoErr.message,
        },
      });

      return false;
    }
  }

  /*
   * Note: no locking is done here, so yes race conditions are likely if you delete a subscription as
   * polling is occuring.
   *
   */
  async pollSubscription(cfg: IConfig, id: string) {
    // fetch results, merge content, update statistics

    // retrieve statistics

    // register failure
    try {
      await cfg.storage.addSubscriptionFailure(id);
    } catch (addFailureErr) {
      // log failure failure lol
      cfg.logger.error("failed to register subscription failure", {
        id,
        error: {
          stack: addFailureErr.stack,
          message: addFailureErr.message,
        },
      });
    }
    // check if the request
  }

  /*
   * In a single async loop, check for subscriptions that need polling for new entries.
   *
   */
  pollSubscriptions(cfg: IConfig) {
    this.pollSubscriptionPid = setInterval(async () => {
      const { ids } = await cfg.storage.getSubscriptionIds();

      cfg.logger.info("polling subscriptions", { count: ids.length });

      for (const id of ids) {
        if (await CommonStorage.overdue(cfg, id)) {
          await this.pollSubscription(cfg, id);
        }
      }
    }, 5_000);
  }
}
