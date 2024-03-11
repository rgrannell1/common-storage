import { assert } from "https://deno.land/std@0.198.0/assert/mod.ts";

import { Context, validateSchema } from "../shared/test-utils.ts";

import { postTopic } from "./topic-post.ts";

const config = {
  port: 8080,
};

Deno.test({
  name: "POST /topic | valid requests return expected response body",
  async fn() {
    const storage = {
      async addTopic(name: string, description: string) {
        return { existed: false };
      },
    };

    const ctx = Context({
      params: {
        topic: "test-name",
      },
      body: {
        description: "test-description",
      },
      state: {
        user: "bob",
        authenticationMethod: "role-based",
      },
    });

    await postTopic(config, {
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
        existed: false,
      }),
    );
  },
});
