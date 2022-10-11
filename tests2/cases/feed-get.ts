import { superdeno } from "https://deno.land/x/superdeno/mod.ts";

import { RequestExpectations } from "../utils/expectations.ts";
import { TestParams } from "../utils/setup.ts";

export async function testUnauthorised(
  testParams: TestParams,
) {
  await Deno.test({
    name: "GET /feed | failed without authentication",
    async fn() {
      const req = superdeno(testParams.app)
        .get("/feed");

      RequestExpectations.jsonContentType(req);
      RequestExpectations.unauthenticatedFailure(req);

      await req;
    },
  });
}

export async function testFeed(
  testParams: TestParams,
) {
  await Deno.test({
    name: "GET /feed | failed without authentication",
    async fn() {
      const user = testParams.config.user();

      const req = superdeno(testParams.app)
        .get("/feed")
        .auth(user.name, user.password);

      RequestExpectations.jsonContentType(req);
      RequestExpectations.ok(req);

      await req;
    },
  });
}
