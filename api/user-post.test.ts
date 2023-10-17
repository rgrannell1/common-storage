import { assert } from "https://deno.land/std@0.198.0/assert/mod.ts";

import { Context, validateSchema } from "../shared/test-utils.ts";

import { postUser } from "./user-post.ts";

const config = {
  port: 8080,
};

Deno.test({
  name: "POST /user | valid requests return expected response body",
  async fn() {
    const storage = {
      async addUser(name: string, role: string) {
        return { existed: false };
      },
      async getRole(role: string) {
        return { name: "test-role", created: new Date(), permissions: [] };
      },
    };

    const ctx = Context({
      params: {
        name: "test-name",
      },
      body: {
        role: "mega-role",
        password: "123123123123",
      },
    });

    await postUser(config, {
      storage: storage as any,
      logger: {
        addActivity() {
          return Promise.resolve();
        },
        addException(err) {
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
