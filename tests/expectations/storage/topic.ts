import { TestParams } from "../../utils/setup.ts";
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.158.0/testing/asserts.ts";

export async function testMissingTopic(
  testParams: TestParams,
  testData: { topic: string },
) {
  const storage = testParams.config.storage();

  try {
    await storage.getTopic(testData.topic);
  } catch (_) {
    return;
  }

  throw new Error("no exception thrown for missing topic");
}

export async function testTopicAdd(
  testParams: TestParams,
  testData: { topic: string; description: string },
) {
  const storage = testParams.config.storage();

  const firstRes = await storage.addTopic(
    testData.topic,
    testData.description,
  );
  assert(firstRes.existed === false, "Topic existed prior to test");

  const secondRes = await storage.addTopic(
    testData.topic,
    testData.description,
  );
  assert(secondRes.existed === true, "Topic did not exist after creation");
}

export async function testTopicRetrieval(
  testParams: TestParams,
  testData: { topic: string; description: string },
) {
  const storage = testParams.config.storage();
  await storage.addTopic(testData.topic, testData.description);

  const firstRes = await storage.getTopic(testData.topic);
  assertEquals(firstRes.name, testData.topic);
  assertEquals(firstRes.description, testData.description);
}
