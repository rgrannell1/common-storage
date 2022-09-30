import { superdeno } from "https://deno.land/x/superdeno/mod.ts";

import * as Properties from "./utils/properties.ts";

import { CommonStorage } from "../src/app.ts";
import { commonConfig } from "./utils/setup.ts";
import { assertObjectMatch } from "https://deno.land/std@0.129.0/testing/asserts.ts";

const config = await commonConfig();
const server = new CommonStorage(config);
const app = server.launch(false);

await Deno.test({
  name: "POST /content/:topic | failed without authentication",
  async fn() {
    const req = superdeno(app)
      .post("/content/birds");

    req.expect(401);
    req.expect(Properties.jsonContentType);
    req.expect(Properties.unauthenticatedFailure);

    await req;
  },
});

await Deno.test({
  name: "POST /content/:topic | fails without content",
  async fn() {
    const user = config.user();

    const req = superdeno(app)
      .post("/content/birds")
      .send({
        batchId: "just-a-test-id",
      })
      .auth(user.name, user.password);

    req.expect(422);
    req.expect((res: any) => {
      assertObjectMatch(res.body, {
        errors: {
          message: "content not provided",
        },
      });
    });

    await req;
  },
});

await Deno.test({
  name: "POST /content/:topic | fails without batchId",
  async fn() {
    const user = config.user();

    const req = superdeno(app)
      .post("/content/birds")
      .auth(user.name, user.password);

    req.expect(422);
    req.expect((res: any) => {
      assertObjectMatch(res.body, {
        errors: {
          message: "batchId not provided",
        },
      });
    });

    await req;
  },
});

await Deno.test({
  name: "POST /content/:topic | batches can be rewritten to and closed",
  async fn() {
    const user = config.user();

    const req = superdeno(app)
      .post("/content/birds")
      .send({
        batchId: "just-testing",
        content: [
          { name: "chicken" },
          { name: "goose" },
        ],
      })
      .auth(user.name, user.password);

    req.expect(200);
    req.expect((res: any) => {
      assertObjectMatch(res.body, {
        batch: {
          id: "just-testing",
          status: "open",
        },
        topic: "birds",
        stats: {
          added: 2,
        },
      });
    });

    await req;

    const close = superdeno(app)
      .post("/content/birds")
      .send({
        batchId: "just-testing",
        content: [],
      })
      .auth(user.name, user.password);

    close.expect(200);
    close.expect((res: any) => {
      assertObjectMatch(res.body, {
        batch: {
          id: "just-testing",
          status: "closed",
        },
        topic: "birds",
        stats: {
          added: 0,
        },
      });
    });

    await close;
  },
});
