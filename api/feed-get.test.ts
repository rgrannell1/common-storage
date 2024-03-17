import { assert } from "https://deno.land/std@0.198.0/assert/mod.ts";

import { Context, validateSchema } from "../shared/test-utils.ts";

import { getFeed } from "./feed-get.ts";

const config = {
  description: "description",
  title: "title",
};

Deno.test({
  name: "GET /feed | valid requests return expected response body",
  async fn() {
    const storage = {
      getTopicNames() {
        return ["foo", "bar"];
      },
      getTopic(name: string) {
        return {
          name: name,
          description: name,
          created: "test-name",
        };
      },
      async getSubscriptions() {
        return [];
      },
      getTopicStats(topic: string) {
        return {
          topic: topic,
          stats: {
            count: 0,
            lastUpdated: 0,
          },
        };
      },
    };

    const ctx = Context({
      body: {},
    });

    await getFeed(config, {
      storage: storage as any,
      logger: {
        info() {
          return Promise.resolve();
        },
        error() {
          return Promise.resolve();
        },
      },
      schema: validateSchema,
    })(ctx);

    assert(ctx.response.status === 200);
    assert(
      ctx.response.body === JSON.stringify({
        description: config.description,
        title: config.title,
        version: "v0.1",
        topics: [
          { topic: "foo", stats: { count: 0, lastUpdated: 0 } },
          { topic: "bar", stats: { count: 0, lastUpdated: 0 } },
        ],
        subscriptions: {},
      }),
    );
  },
});
