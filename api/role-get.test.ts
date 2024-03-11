import { assert } from "https://deno.land/std@0.198.0/assert/mod.ts";

import { Context, validateSchema } from "../shared/test-utils.ts";

import { getRole } from "./role-get.ts";

const config = {
  port: 8080,
};

Deno.test({
  name: "GET /role | invalid requests fail as expected",
  async fn() {
    const storage = {
      async getRole() {
        return [];
      },
    };

    const ctx = Context({
      params: {},
    });

    try {
      await getRole(config, {
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
    } catch (err) {
      assert(err.message.includes("must have required property 'role'"));
    }
  },
});

Deno.test({
  name: "GET /role | returns expected information",
  async fn() {
    const storage = {
      async getRole() {
        return {
          created: 1234,
          permissions: [{
            routes: "ALL",
            topics: "ALL",
          }],
        };
      },
    };

    const ctx = Context({
      params: {
        role: "test",
      },
    });

    await getRole(config, {
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
  },
});
