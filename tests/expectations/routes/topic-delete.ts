import { superdeno } from "https://deno.land/x/superdeno/mod.ts";
import { assertObjectMatch } from "https://deno.land/std@0.129.0/testing/asserts.ts";

import { RequestExpectations } from "../../utils/expectations.ts";
import { TestParams } from "../../utils/setup.ts";

export async function testUnauthorised(
  testParams: TestParams,
  testData: { topic: string; description: string },
) {
  const req = superdeno(testParams.app)
    .delete(`/topic/${testData.topic}`)
    .set("content-type", "application/json");

  RequestExpectations.jsonContentType(req);
  RequestExpectations.unauthenticatedFailure(req);

  await req;
}

export async function testCreateDelete(
  testParams: TestParams,
  testData: { topic: string; description: string },
) {
  const user = testParams.config.user;

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

  const deleteReq = superdeno(testParams.app)
    .delete(`/topic/${testData.topic}`)
    .set("content-type", "application/json")
    .auth(user.name, user.password);

  RequestExpectations.jsonContentType(deleteReq);
  RequestExpectations.ok(deleteReq);
  deleteReq.expect((res) => {
    assertObjectMatch(res.body, {
      existed: true,
    });
  });

  await deleteReq;
}
