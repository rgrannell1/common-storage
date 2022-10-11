
import { TestParams } from "../../utils/setup.ts";
import { assert, assertEquals } from "https://deno.land/std@0.158.0/testing/asserts.ts";

export async function testMissingTopic(
  testParams: TestParams,
  testData: { topic: string },
) {
  await Deno.test({
    name: "Storage | throws exception for missing expections",
    async fn() {
      const storage = testParams.storage;

      try {
        await storage.getTopic(testData.topic);
      } catch (_) {
        return
      }

      throw new Error('no exception thrown for missing topic');
    },
  });
}

export async function testTopicAdd(
  testParams: TestParams,
  testData: { topic: string, description: string },
) {
  await Deno.test({
    name: "Storage | topics can be persisted",
    async fn() {
      const storage = testParams.storage;

      const firstRes = await storage.addTopic(testData.topic, testData.description);
      assert(firstRes.existed === false, 'Topic existed prior to test');

      const secondRes = await storage.addTopic(testData.topic, testData.description);
      assert(secondRes.existed === true, 'Topic did not exist after creation');
    },
  });
}

export async function testTopicRetrieval(
  testParams: TestParams,
  testData: { topic: string, description: string },
) {
  await Deno.test({
    name: "Storage | topics can be retrieved",
    async fn() {
      const storage = testParams.storage;
      await storage.addTopic(testData.topic, testData.description);

      const firstRes = await storage.getTopic(testData.topic);
      assertEquals(firstRes.name, testData.topic)
      assertEquals(firstRes.description, testData.description)
    },
  });
}