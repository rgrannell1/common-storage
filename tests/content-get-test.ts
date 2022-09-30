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
  name: "GET /content/:topic | failed without authentication",
  async fn() {
    const req = superdeno(app)
      .get("/content/birds");

    req.expect(Status.Unauthorized);
    req.expect(Properties.jsonContentType);
    req.expect(Properties.unauthenticatedFailure);

    await req;
  },
});

await Deno.test({
  name: "GET /content/:topic | fails for non-existing topic",
  async fn() {
    const user = config.user();

    const req = superdeno(app)
      .get("/content/birds")
      .auth(user.name, user.password);

    req.expect(Status.NotFound);
    req.expect(Properties.jsonContentType);

    req.expect((res: any) => {
      assertObjectMatch(res.body, {
        errors: {
          message: 'topic "birds" does not exist',
        },
      });
    });

    await req;
  },
});

await Deno.test({
  name: "GET /content/:topic | returns empty content for empty topic",
  async fn() {
    const user = config.user();
    const storage = config.storage();

    await storage.addTopic(
      "birds",
      "they fly",
    );

    const req = superdeno(app)
      .get("/content/birds")
      .auth(user.name, user.password);

    req.expect(Properties.jsonContentType);

    req.expect((res: any) => {
      assertObjectMatch(res.body, {
        topic: "birds",
        content: [],
      });
    });

    await req;
  },
});

await Deno.test({
  name: "GET /content/:topic | returns two pages for twelve items",
  async fn() {
    const user = config.user();
    const storage = config.storage();

    // setup a topic
    await storage.addTopic(
      "birds",
      "they fly",
    );

    // publish some data
    await superdeno(app)
      .post("/content/birds")
      .send({
        batchId: "test-id",
        content: [
          { name: "chicken" },
          { name: "duck" },
          { name: "pidgeon" },
          { name: "goose" },
          { name: "tit" },
          { name: "woodcock" },
          { name: "pheasant" },
          { name: "quail" },
          { name: "eagle" },
          { name: "owl" },
          { name: "kestrel" },
          { name: "budgie" },
        ],
      })
      .auth(user.name, user.password);

    // close the batch
    await superdeno(app)
      .post("/content/birds")
      .send({
        batchId: "test-id",
        content: [],
      })
      .auth(user.name, user.password);

    const contentReq0 = superdeno(app)
      .get("/content/birds")
      .auth(user.name, user.password)
      .expect((res: any) => {
        assertObjectMatch(res.body, {
          topic: "birds",
          content: [
            { id: 1, value: { name: "chicken" } },
            { id: 2, value: { name: "duck" } },
            { id: 3, value: { name: "pidgeon" } },
            { id: 4, value: { name: "goose" } },
            { id: 5, value: { name: "tit" } },
            { id: 6, value: { name: "woodcock" } },
            { id: 7, value: { name: "pheasant" } },
            { id: 8, value: { name: "quail" } },
            { id: 9, value: { name: "eagle" } },
            { id: 10, value: { name: "owl" } },
          ],
          lastId: 10,
        });
      })
      .expect(Status.OK);

    await contentReq0;

    const contentReq1 = superdeno(app)
      .get("/content/birds?startId=10")
      .auth(user.name, user.password)
      .expect((res: any) => {
        assertObjectMatch(res.body, {
          topic: "birds",
          startId: "10",
          content: [
            { id: 11, value: { name: "kestrel" } },
            { id: 12, value: { name: "budgie" } },
          ],
          lastId: 12,
        });
      })
      .expect(Status.OK);

    await contentReq1;

    const contentReq2 = superdeno(app)
      .get("/content/birds?startId=1000")
      .auth(user.name, user.password)
      .expect((res: any) => {
        assertObjectMatch(res.body, {
          topic: "birds",
          startId: "1000",
          content: [],
        });
      })
      .expect(Status.OK);

    await contentReq2;

    await storage.close();
  },
});
