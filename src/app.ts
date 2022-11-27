import { json, opine } from "https://deno.land/x/opine/mod.ts";

import { IConfig } from "./types/interfaces/config.ts";
import { feedGet } from "./api/feed/feed-get.ts";
import { topicGet } from "./api/topic/topic-get.ts";
import { topicPost } from "./api/topic/topic-post.ts";
import { topicDelete } from "./api/topic/topic-delete.ts";
import { contentPost } from "./api/content/content-post.ts";
import { contentGet } from "./api/content/content-get.ts";
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

  constructor(config: IConfig) {
    this.config = config;
  }

  async launch(listen: boolean) {
    const app = opine();
    const cfg = this.config;

    app.use(logRoutes(cfg));
    app.use(json(cfg));

    // -- cors options route for post preflight requests
    app.options('/*', opineCors());

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

    const port = cfg.port;

    if (listen) {
      app.listen(port, () => {
        motd(cfg);
      });
    }

    await cfg.storage.init();

    return app;
  }
}
