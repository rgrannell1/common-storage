/*
 * Test the server works as expected (integration test)
 */

import { ServerTest } from "./utils/setup.ts";
import * as ContentGet from "./expectations/routes/content-get.ts";
import * as FeedGet from "./expectations/routes/feed-get.ts";
import * as TopicGet from "./expectations/routes/topic-get.ts";
import * as TopicPost from "./expectations/routes/topic-post.ts";
import * as ContentPost from "./expectations/routes/content-post.ts";
import * as StorageTopic from "./expectations/storage/topic.ts";
import { TestCases } from "./utils/cases.ts";


/*
 * ContentGet
 */
async function contentGetTest(suite: ServerTest) {
  for (const topic of TestCases.topics()) {
    await Deno.test({
      name: "GET /content/:topic | fails when unauthorised",
      async fn() {
        await suite.test(async (testParams) => {
          await ContentGet.testUnauthorised(testParams, topic);
        });
      },
    });
  }

  for (const topic of TestCases.topics()) {
    await Deno.test({
      name: "GET /content/:topic | fails when topic is missing",
      async fn() {
        await suite.test(async (testParams) => {
          await ContentGet.testMissingTopic(testParams, topic);
        });
      },
    });
  }

  for (const topic of TestCases.topics()) {
    await Deno.test({
      name: "GET /content/:topic | returns empty content for newly created topic",
      async fn() {
        await suite.test(async (testParams) => {
          await ContentGet.testEmptyTopic(testParams, topic);
        });
      },
    });
  }

  for (const tcase of TestCases.content()) {
    await Deno.test({
      name: "GET /content/:topic | expected content through pagination",
      async fn() {
        await suite.test(async (testParams) => {
          await ContentGet.testContentRetrieval(testParams, tcase);
        });
      },
    });
  }
}

/*
* FeedGet
*/
await Deno.test({
  name: "GET /feed | failed without authentication",
  async fn() {
    await suite.test(async (testParams) => {
      await FeedGet.testUnauthorised(testParams);
    });
  },
});

await Deno.test({
  name: "GET /feed | succeeds with authentication",
  async fn() {
    await suite.test(async (testParams) => {
      await FeedGet.testFeed(testParams);
    });
  },
});

for (const tcase of TestCases.topics()) {
  await Deno.test({
    name: "GET /feed | returns stats for topics",
    async fn() {
      await suite.test(async (testParams) => {
        await FeedGet.testFeedStats(testParams, tcase);
      });
    },
  });
}

/*
* TopicGet
*/

for (const tcase of TestCases.topics()) {
  await Deno.test({
    name: "GET /topic/:name | failed without authentication",
    async fn() {
      await suite.test(async (testParams) => {
        await TopicGet.testUnauthorised(testParams, tcase);
      });
    },
  });
}

for (const tcase of TestCases.topics()) {
  await Deno.test({
    name: "GET /topic/:name | fails for missing topic",
    async fn() {
      await suite.test(async (testParams) => {
        await TopicGet.testTopic(testParams, tcase);
      });
    },
  });
}

/*
* TopicPost
*/
for (const tcase of TestCases.topics()) {
  await Deno.test({
    name: "POST /topic/:topic | failed without authentication",
    async fn() {
      await suite.test(async (testParams) => {
        await TopicPost.testUnauthorised(testParams, tcase);
      });
    },
  });
}

for (const tcase of TestCases.topics()) {
  await Deno.test({
    name: "POST /topic/:topic | getset",
    async fn() {
      await suite.test(async (testParams) => {
        await TopicPost.testGetSet(testParams, tcase);
      });
    },
  });
}

/*
* ContentPost
*/
for (const tcase of TestCases.topics()) {
  await Deno.test({
    name: "POST /content/:topic | failed without authentication",
    async fn() {
      await suite.test(async (testParams) => {
        await ContentPost.testUnauthorised(testParams, tcase);
      });
    },
  });
}

for (const tcase of TestCases.topics()) {
  await Deno.test({
    name: "POST /content/:topic | fails without content",
    async fn() {
      await suite.test(async (testParams) => {
        await ContentPost.testMalformed(testParams, tcase);
      });
    },
  });
}

for (const tcase of TestCases.content()) {
  await Deno.test({
    name: "POST /content/:topic | batches can be rewritten to and closed",
    async fn() {
      await suite.test(async (testParams) => {
        await ContentPost.testBatchWrites(testParams, tcase);
      });
    },
  });
}

async function x() {
  await suite.test(async (testParams) => {
    const tcases = [
      { topic: "birds" },
    ];
    for (const tcase of tcases) {
      await StorageTopic.testMissingTopic(testParams, tcase);
    }
  });

  await suite.test(async (testParams) => {
    const tcases = [
      { topic: "birds", description: "they flap" },
    ];
    for (const tcase of tcases) {
      await StorageTopic.testTopicAdd(testParams, tcase);
    }
  });

  await suite.test(async (testParams) => {
    const tcases = [
      { topic: "birds", description: "they flap" },
    ];
    for (const tcase of tcases) {
      await StorageTopic.testTopicRetrieval(testParams, tcase);
    }
  });
}


const suite = new ServerTest("sqlite");

await contentGetTest(suite);
