import { superdeno } from "https://deno.land/x/superdeno/mod.ts";

import { RequestExpectations } from "../../utils/expectations.ts";
import { TestParams } from "../../utils/setup.ts";

export async function testUnauthorised(
  testParams: TestParams,
  testData: { id: string },
) {
  const req = superdeno(testParams.app)
    .get(`/subscription/${testData.id}`)
    .set("content-type", "application/json");

  RequestExpectations.jsonContentType(req);
  RequestExpectations.unauthenticatedFailure(req);

  await req;
}
