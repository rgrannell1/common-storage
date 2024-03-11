import { assert } from "https://deno.land/std@0.198.0/assert/mod.ts";

import { Context, validateSchema } from "../shared/test-utils.ts";

import { postRole } from "./role-post.ts";

import { Permission } from "../types/index.ts";

const config = {
  port: 8080,
};

Deno.test({
  name: "POST /role | valid requests return expected response body",
  async fn() {
    const storage = {
      async getRole(name: string) {
        return { name: "test-role" };
      },
      async addRole(name: string, permissions: Permission[]) {
        assert(name === "test-role");
      },
    };

    const ctx = Context({
      params: {
        role: "test-role",
      },
      body: {
        permissions: [{
          routes: "ALL",
          topics: "USER_CREATED",
        }],
      },
    });

    await postRole(config, {
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
        existed: true,
      }),
    );
  },
});

Deno.test({
  name: "POST /role | invalid requests fail as expected",
  async fn() {
    const storage = {
      async getRoles() {
        return [];
      },
      async addRole(name: string, permissions: Permission[]) {
      },
    };

    const ctx = Context({
      body: {
        permissions: [{
          routes: "ALL",
          topics: "USER_CREATED",
        }],
      },
    });

    try {
      await postRole(config, {
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
