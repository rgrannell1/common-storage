import { superdeno } from "https://deno.land/x/superdeno/mod.ts";

import * as Properties from "./utils/properties.ts";

import { CommonStorage } from "../src/app.ts";
import { commonConfig } from "./utils/setup.ts";
import { assertObjectMatch } from "https://deno.land/std@0.129.0/testing/asserts.ts";

const config = await commonConfig();

const server = new CommonStorage(config);
const app = server.launch(false);

await Deno.test({
  name: "GET /topic/:name | failed without authentication",
  async fn() {
    const req = superdeno(app)
      .get("/topic/birds");

    req.expect(Properties.jsonContentType);
    req.expect(Properties.unauthenticatedFailure);

    await req;
  },
});

await Deno.test({
  name: "GET /topic/:name | fails for missing /topic/:name",
  async fn() {
    const user = config.user();

    const req = superdeno(app)
      .get("/topic/birds")
      .auth(user.name, user.password);

    req.expect(Properties.jsonContentType);
    req.expect(404);
    req.expect((res: any) => {
      assertObjectMatch(res.body, {
        errors: {
          message: "Topic does not exist",
        },
      });
    });

    await req;
  },
});
