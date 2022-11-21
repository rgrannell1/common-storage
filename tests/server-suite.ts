/*
 * Test the server works as expected (integration test)
 */

import { ServerTest } from "./utils/setup.ts";
import * as ContentGet from "./expectations/routes/content-get.ts";
import * as FeedGet from "./expectations/routes/feed-get.ts";
import * as TopicGet from "./expectations/routes/topic-get.ts";
import * as TopicPost from "./expectations/routes/topic-post.ts";
import * as TopicDelete from "./expectations/routes/topic-delete.ts";
import * as ContentPost from "./expectations/routes/content-post.ts";
import { TestCases } from "./utils/cases.ts";

/*
 * ContentGet
 */
export async function contentGetTests(suite: ServerTest) {
  for (const topic of TestCases.topics(10)) {
    await Deno.test({
      name: "GET /content/:topic | fails when unauthorised",
      async fn() {
        await suite.test(async (testParams) => {
          await ContentGet.testUnauthorised(testParams, topic);
        });
      },
    });
  }

  for (const topic of TestCases.topics(10)) {
    await Deno.test({
      name: "GET /content/:topic | fails when topic is missing",
      async fn() {
        await suite.test(async (testParams) => {
          await ContentGet.testMissingTopic(testParams, topic);
        });
      },
    });
  }

  for (const topic of TestCases.topics(10)) {
    await Deno.test({
      name:
        "GET /content/:topic | returns empty content for newly created topic",
      async fn() {
        await suite.test(async (testParams) => {
          await ContentGet.testEmptyTopic(testParams, topic);
        });
      },
    });
  }

  for (const tcase of TestCases.content(10)) {
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
export async function feedGetTests(suite: ServerTest) {
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

  for (const tcase of TestCases.topics(10)) {
    await Deno.test({
      name: "GET /feed | returns stats for topics",
      async fn() {
        await suite.test(async (testParams) => {
          await FeedGet.testFeedStats(testParams, tcase);
        });
      },
    });
  }
}

/*
* TopicGet
*/
export async function topicGetTests(suite: ServerTest) {
  for (const tcase of TestCases.topics(10)) {
    await Deno.test({
      name: "GET /topic/:name | failed without authentication",
      async fn() {
        await suite.test(async (testParams) => {
          await TopicGet.testUnauthorised(testParams, tcase);
        });
      },
    });
  }

  for (const tcase of TestCases.topics(10)) {
    await Deno.test({
      name: "GET /topic/:name | fails for missing topic",
      async fn() {
        await suite.test(async (testParams) => {
          await TopicGet.testTopic(testParams, tcase);
        });
      },
    });
  }
}

/*
* TopicPost
*/
export async function feedPostTests(suite: ServerTest) {
  for (const tcase of TestCases.topics(10)) {
    await Deno.test({
      name: "POST /topic/:topic | failed without authentication",
      async fn() {
        await suite.test(async (testParams) => {
          await TopicPost.testUnauthorised(testParams, tcase);
        });
      },
    });
  }

  for (const tcase of TestCases.topics(10)) {
    await Deno.test({
      name: "POST /topic/:topic | getset",
      async fn() {
        await suite.test(async (testParams) => {
          await TopicPost.testGetSet(testParams, tcase);
        });
      },
    });
  }
}
/*
* TopicDelete
*/
export async function topicDeleteTests(suite: ServerTest) {
  for (const tcase of TestCases.topics(10)) {
    await Deno.test({
      name: "DELETE /topic/:topic | failed without authentication",
      async fn() {
        await suite.test(async (testParams) => {
          await TopicDelete.testUnauthorised(testParams, tcase);
        });
      },
    });

    await Deno.test({
      name: "DELETE /topic/:topic | deletes when exists",
      async fn() {
        await suite.test(async (testParams) => {
          await TopicDelete.testCreateDelete(testParams, tcase);
        });
      },
    });
  }

}



/*
* ContentPost
*/
export async function contentPostTests(suite: ServerTest) {
  for (const tcase of TestCases.topics(10)) {
    await Deno.test({
      name: "POST /content/:topic | failed without authentication",
      async fn() {
        await suite.test(async (testParams) => {
          await ContentPost.testUnauthorised(testParams, tcase);
        });
      },
    });
  }

  for (const tcase of TestCases.topics(10)) {
    await Deno.test({
      name: "POST /content/:topic | fails without content",
      async fn() {
        await suite.test(async (testParams) => {
          await ContentPost.testMalformed(testParams, tcase);
        });
      },
    });
  }

  for (const tcase of TestCases.content(10)) {
    await Deno.test({
      name: "POST /content/:topic | batches can be rewritten to and closed",
      async fn() {
        await suite.test(async (testParams) => {
          await ContentPost.testBatchWrites(testParams, tcase);
        });
      },
    });
  }
}
