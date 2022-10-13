import { superdeno } from "https://deno.land/x/superdeno/mod.ts";
import { assertObjectMatch } from "https://deno.land/std@0.129.0/testing/asserts.ts";

import { RequestExpectations } from "../../utils/expectations.ts";
import { TestParams } from "../../utils/setup.ts";

export async function testUnauthorised(
  testParams: TestParams,
  testData: { topic: string; description: string },
) {
  const req = superdeno(testParams.app)
    .post(`/topic/${testData.topic}`)
    .send({
      description: testData.description,
    })
    .set("content-type", "application/json");

  RequestExpectations.jsonContentType(req);
  RequestExpectations.unauthenticatedFailure(req);

  await req;
}

export async function testGetSet(
  testParams: TestParams,
  testData: { topic: string; description: string },
) {
  const user = testParams.config.user();

  const postReq = superdeno(testParams.app)
    .post(`/topic/${testData.topic}`)
    .send({
      description: testData.description,
    })
    .set("content-type", "application/json")
    .auth(user.name, user.password);

  RequestExpectations.jsonContentType(postReq);
  RequestExpectations.ok(postReq);

  await postReq;

  const getReq = superdeno(testParams.app)
    .get(`/topic/${testData.topic}`)
    .auth(user.name, user.password);

  RequestExpectations.jsonContentType(getReq);
  RequestExpectations.ok(getReq);
  getReq.expect((res) => {
    assertObjectMatch(res.body, {
      name: testData.topic,
      description: testData.description,
    });
  });

  await getReq;
}
