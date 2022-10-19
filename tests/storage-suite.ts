/*
 * Test that storage backends behave as expected (integration test)
 */

import { ServerTest } from "./utils/setup.ts";
import { TestCases } from "./utils/cases.ts";
import * as StorageTopic from "./expectations/storage/topic.ts";

export async function storageTests(suite: ServerTest) {
  for (const tcase of TestCases.topics()) {
    await Deno.test({
      name: "Storage | throws exception for missing expections",
      async fn() {
        await suite.test(async (testParams) => {
          await StorageTopic.testMissingTopic(testParams, tcase);
        });
      },
    });
  }

  for (const tcase of TestCases.topics()) {
    await Deno.test({
      name: "Storage | topics can be persisted",
      async fn() {
        await suite.test(async (testParams) => {
          await StorageTopic.testTopicAdd(testParams, tcase);
        });
      },
    });
  }

  for (const tcase of TestCases.topics()) {
    await Deno.test({
      name: "Storage | topics can be retrieved",
      async fn() {
        await suite.test(async (testParams) => {
          await StorageTopic.testTopicRetrieval(testParams, tcase);
        });
      },
    });
  }
}
