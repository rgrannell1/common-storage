import { superdeno } from "https://deno.land/x/superdeno/mod.ts";

import { RequestExpectations } from "../utils/expectations.ts";
import { TestParams } from "../utils/setup.ts";

export async function testUnauthorised(
  testParams: TestParams,
  testData: { topic: string }
) {
  await Deno.test({
    name: "GET /feed | failed without authentication",
    async fn() {
      const req = superdeno(testParams.app)
        .get(`/topic/${testData.topic}`);

      RequestExpectations.jsonContentType(req);
      RequestExpectations.unauthenticatedFailure(req);

      await req;
    },
  });
}

export async function testTopic(
  testParams: TestParams,
  testData: { topic: string },
) {
  await Deno.test({
    name: "GET /topic/:name | failed without authentication",
    async fn() {
      const user = testParams.config.user();

      const req = superdeno(testParams.app)
        .get(`/topic/${testData.topic}`)
        .auth(user.name, user.password);

      RequestExpectations.jsonContentType(req);
      RequestExpectations.notFound(req);

      await req;
    },
  });
}
