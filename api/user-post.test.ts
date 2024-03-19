import { assert } from "../dev_deps.ts";
import { Context, validateSchema } from "../shared/test-utils.ts";

import { postUser } from "./user-post.ts";

const config = {
  port: 8080,
};

Deno.test({
  name: "POST /user | valid requests return expected response body",
  async fn() {
    const storage = {
      async addUser(_name: string, _role: string) {
        return { existed: false };
      },
      async getRole(_role: string) {
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
