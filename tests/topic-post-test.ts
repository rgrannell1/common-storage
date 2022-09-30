import { superdeno } from "https://deno.land/x/superdeno/mod.ts";
import { Status } from "https://deno.land/std/http/http_status.ts";

import * as Properties from "./utils/properties.ts";

import { CommonStorage } from "../src/app.ts";
import { commonConfig } from "./utils/setup.ts";
import { assertObjectMatch } from "https://deno.land/std@0.129.0/testing/asserts.ts";

const config = await commonConfig();

const server = new CommonStorage(config);
const app = server.launch(false);

await Deno.test({
  name: "POST /topic/:name | failed without authentication",
  async fn() {
    const req = superdeno(app)
      .post("/topic/birds");

    req.expect(Properties.jsonContentType);
    req.expect(Properties.unauthenticatedFailure);

    await req;
  },
});

function postTopic(app: any) {
  const user = config.user();

  return superdeno(app)
    .post("/topic/birds")
    .set("content-type", "application/json")
    .send({
      description: "flapping creatures",
    })
    .auth(user.name, user.password);
}

for (const existed of [false, true]) {
  await Deno.test({
    name: "POST /topic/:name | Adds a topic when authenticated",
    async fn() {
      const req = postTopic(app);

      req.expect(Status.OK);
      req.expect(Properties.jsonContentType);
      req.expect((res: any) => {
        assertObjectMatch(res.body, {
          existed,
        });
      });

      await req;
    },
  });
}

await Deno.test({
  name: "POST + GET /topic/:name | Correct content stored",
  async fn() {
    const user = config.user();

    await postTopic(app);

    await superdeno(app)
      .get("/topic/birds")
      .auth(user.name, user.password)
      .expect(Status.OK)
      .expect(Properties.jsonContentType)
      .expect((res: any) => {
        assertObjectMatch(res.body, {
          name: "birds",
          description: "flapping creatures",
        });
      });
  },
});
