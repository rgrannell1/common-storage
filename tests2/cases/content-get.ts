import { IResponse, superdeno } from "https://deno.land/x/superdeno/mod.ts";
import {
  assertObjectMatch,
} from "https://deno.land/std@0.159.0/testing/asserts.ts";

import {
  BodyExpectations,
  RequestExpectations,
} from "../utils/expectations.ts";
import { TestParams } from "../utils/setup.ts";

export async function testUnauthorised(
  testParams: TestParams,
  testData: { topic: string },
) {
  await Deno.test({
    name: "GET /content/:topic | fails without authentication",
    async fn() {
      const req = superdeno(testParams.app)
        .get(`/content/${testData.topic}`);

      RequestExpectations.jsonContentType(req);
      RequestExpectations.unauthenticatedFailure(req);

      await req;
    },
  });
}

export async function testMissingTopic(
  testParams: TestParams,
  testData: { topic: string },
) {
  await Deno.test({
    name: "GET /content/:topic | fails for non-existing topic",
    async fn() {
      const user = testParams.config.user();

      const req = superdeno(testParams.app)
        .get(`/content/${testData.topic}`)
        .auth(user.name, user.password);

      RequestExpectations.notFound(req);
      RequestExpectations.jsonContentType(req);

      req.expect((res) => {
        assertObjectMatch(res.body, {
          errors: {
            message: `topic "${testData.topic}" does not exist`,
          },
        });
      });

      await req;
    },
  });
}

export async function testEmptyTopic(
  testParams: TestParams,
  testData: { topic: string; description: string },
) {
  await Deno.test({
    name: "GET /content/:topic | returns empty content for empty topic",
    async fn() {
      const { topic, description } = testData;

      const user = testParams.config.user();
      await testParams.storage.addTopic(
        topic,
        description,
      );

      const req = superdeno(testParams.app)
        .get(`/content/${topic}`)
        .auth(user.name, user.password);

      RequestExpectations.jsonContentType(req);
      req.expect((res: IResponse) => {
        assertObjectMatch(res.body, {
          topic,
          content: [],
        });
      });

      await req;
    },
  });
}

export async function testContentRetrieval(
  testParams: TestParams,
  testData: { topic: string; description: string; content: any[] },
) {
  await Deno.test({
    name: "GET /content/:topic |   expected content through pagination",
    async fn() {
      const { topic, description, content } = testData;

      const user = testParams.config.user();
      await testParams.storage.addTopic(
        topic,
        description,
      );

      // -- create topic
      await superdeno(testParams.app)
        .get(`/content/${topic}`)
        .auth(user.name, user.password);

      // -- publish content in batches
      for (let idx = 0; idx < content.length; idx += 10) {
        const batch = content.slice(idx, idx + 10);

        await superdeno(testParams.app)
          .post(`/content/${topic}`)
          .send({
            batchId: "test-id",
            content: batch,
          })
          .auth(user.name, user.password);
      }

      // close the batch
      await superdeno(testParams.app)
        .post(`/content/${topic}`)
        .send({
          batchId: "test-id",
          content: [],
        })
        .auth(user.name, user.password);

      // retrieve the content and compare item-by-item
      let lastId = 0;
      const retrieved = [];
      while (true) {
        const res = await superdeno(testParams.app)
          .get(`/content/${topic}?startId=${lastId}`)
          .auth(user.name, user.password);

        const body = res.body;
        if (body.content.length === 0) {
          break;
        }

        lastId = body.lastId;

        if (body.hasOwnProperty("lastId") && !Number.isInteger(lastId)) {
          throw new Error(`lastId was not a number:\n${body}`);
        }

        retrieved.push(...body.content);
      }

      BodyExpectations.storedContent(content, retrieved);
    },
  });
}
