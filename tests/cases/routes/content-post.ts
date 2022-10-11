import { IResponse, superdeno } from "https://deno.land/x/superdeno/mod.ts";
import {
  assertObjectMatch,
} from "https://deno.land/std@0.159.0/testing/asserts.ts";

import {
  BodyExpectations,
  RequestExpectations,
} from "../../utils/expectations.ts";
import { TestParams } from "../../utils/setup.ts";

export async function testUnauthorised(
  testParams: TestParams,
  testData: { topic: string },
) {
  await Deno.test({
    name: "POST /content/:topic | failed without authentication",
    async fn() {
      const req = superdeno(testParams.app)
        .post(`/content/${testData.topic}`);

      RequestExpectations.jsonContentType(req);
      RequestExpectations.unauthenticatedFailure(req);

      await req;
    },
  });
}

export async function testMalformed(
  testParams: TestParams,
  testData: { topic: string },
) {
  await Deno.test({
    name: "POST /content/:topic | fails without content",
    async fn() {
      const user = testParams.config.user();

      const req = superdeno(testParams.app)
        .post(`/content/${testData.topic}`)
        .send({
          batchId: "just-a-test-id",
        })
        .auth(user.name, user.password);

      RequestExpectations.jsonContentType(req);
      RequestExpectations.unprocessableEntity(req);

      req.expect((res) => {
        assertObjectMatch(res.body, {
          errors: {
            message: "content not provided",
          },
        });
      });

      await req;
    },
  });
}

export async function testBatchWrites(
  testParams: TestParams,
  testData: { topic: string; content: any[] },
) {
  await Deno.test({
    name: "POST /content/:topic | batches can be rewritten to and closed",
    async fn() {
      const user = testParams.config.user();

      const writeReq = superdeno(testParams.app)
        .post(`/content/${testData.topic}`)
        .send({
          batchId: "just-testing",
          content: testData.content,
        })
        .auth(user.name, user.password);

      RequestExpectations.jsonContentType(writeReq);
      RequestExpectations.ok(writeReq);

      writeReq.expect((res) => {
        assertObjectMatch(res.body, {
          batch: {
            id: "just-testing",
            status: "open",
          },
          topic: testData.topic,
          stats: {
            added: testData.content.length,
          },
        });
      });

      await writeReq;

      // close

      const closeReq = superdeno(testParams.app)
        .post(`/content/${testData.topic}`)
        .send({
          batchId: "just-testing",
          content: [],
        })
        .auth(user.name, user.password);

      RequestExpectations.ok(closeReq);

      closeReq.expect((res) => {
        assertObjectMatch(res.body, {
          batch: {
            id: "just-testing",
            status: "closed",
          },
          topic: testData.topic,
          stats: {
            added: 0,
          },
        });
      });

      await closeReq;
    },
  });
}
