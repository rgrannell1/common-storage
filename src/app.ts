import { json, opine } from "https://deno.land/x/opine/mod.ts";

import { IConfig } from "./interfaces/config.ts";
import { feedGet } from "./api/feed/feed-get.ts";
import { topicGet } from "./api/topic/topic-get.ts";
import { topicPost } from "./api/topic/topic-post.ts";
import { contentPost } from "./api/content/content-post.ts";
import { contentGet } from "./api/content/content-get.ts";
import { authorised } from "./api/authorised.ts";
import { setHeaders } from "./api/set-headers.ts";
import { logRoutes } from "./api/log-routes.ts";

export class CommonStorage {
  config: IConfig;

  constructor(config: IConfig) {
    this.config = config;
  }

  launch(listen: boolean) {
    const app = opine();
    const cfg = this.config;
    const log = cfg.logger();

    app.use(logRoutes(cfg));
    app.use(json(cfg));
    app.use(authorised(cfg));
    app.use(setHeaders(cfg));

    // -- feed routes
    app.get("/feed", feedGet(cfg));

    // -- topic
    app.get("/topic/:name", topicGet(cfg));
    app.post("/topic/:name", topicPost(cfg));

    // -- content
    app.post("/content/:topic", contentPost(cfg));
    app.get("/content/:topic", contentGet(cfg));

    const port = cfg.port();

    if (listen) {
      app.listen(port, () => {
        log.info(`Listening on http://localhost:${port}`);
      });
    }

    return app;
  }
}
