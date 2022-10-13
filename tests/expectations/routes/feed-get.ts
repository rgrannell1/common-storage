import { assertObjectMatch } from "https://deno.land/std@0.129.0/testing/asserts.ts";
import { superdeno } from "https://deno.land/x/superdeno/mod.ts";

import { RequestExpectations } from "../../utils/expectations.ts";
import { TestParams } from "../../utils/setup.ts";

export async function testUnauthorised(
  testParams: TestParams,
) {
  const req = superdeno(testParams.app)
    .get("/feed");

  RequestExpectations.jsonContentType(req);
  RequestExpectations.unauthenticatedFailure(req);

  await req;
}

export async function testFeed(
  testParams: TestParams,
) {
  const user = testParams.config.user();

  const req = superdeno(testParams.app)
    .get("/feed")
    .auth(user.name, user.password);

  RequestExpectations.jsonContentType(req);
  RequestExpectations.ok(req);

  await req;
}

export async function testFeedStats(
  testParams: TestParams,
  testData: { topic: string; description: string },
) {
  const user = testParams.config.user();

  const topicPostReq = superdeno(testParams.app)
    .post(`/topic/${testData.topic}`)
    .send({
      description: testData.description,
    })
    .set("content-type", "application/json")
    .auth(user.name, user.password);

  RequestExpectations.jsonContentType(topicPostReq);
  RequestExpectations.ok(topicPostReq);

  await topicPostReq;

  const getFeed = superdeno(testParams.app)
    .get("/feed")
    .expect((req) => {
      assertObjectMatch(req.body, {
        description: testParams.config.description(),
        title: testParams.config.title(),
        version: "v0.1",
        topics: [
          {
            topic: {
              name: testData.topic,
              description: testData.description,
            },
            stats: {
              count: 0,
            },
          },
        ],
      });
    })
    .auth(user.name, user.password);

  RequestExpectations.ok(getFeed);
  RequestExpectations.jsonContentType(getFeed);

  await getFeed;
}
