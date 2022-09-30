import { superdeno } from "https://deno.land/x/superdeno/mod.ts";

import * as Properties from "./utils/properties.ts";

import { CommonStorage } from "../src/app.ts";
import { commonConfig } from "./utils/setup.ts";

const config = await commonConfig();
const server = new CommonStorage(config);
const app = server.launch(false);

await Deno.test({
  name: "GET /feed | failed without authentication",
  async fn() {
    const req = superdeno(app)
      .get("/feed");

    req.expect(Properties.jsonContentType);
    req.expect(Properties.unauthenticatedFailure);

    await req;
  },
});

await Deno.test({
  name: "GET /feed | valid response when authenticated",
  async fn() {
    const user = config.user();

    const req = superdeno(app)
      .get("/feed")
      .auth(user.name, user.password);

    req.expect(Properties.jsonContentType);

    try {
      await req;
    } finally {
      await config.storage().close();
    }
  },
});
