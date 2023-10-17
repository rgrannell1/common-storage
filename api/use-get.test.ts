import { assert } from "https://deno.land/std@0.198.0/assert/mod.ts";

import { Context, validateSchema } from "../shared/test-utils.js";

import { getUser } from "./user-get.js";

const config = {
  port: 8080,
};

Deno.test({
  name: "GET /user | invalid requests fail as expected",
  async fn() {
    const storage = {
      async getUser() {
        return [];
      },
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
      params: {},
    });

    try {
      await getUser(config, {
        storage: storage as any,
        logger: {
          addActivity() {
            return Promise.resolve();
          },
          addException() {
            return Promise.resolve();
          },
        },
        schema: validateSchema,
      })(ctx);
    } catch (err) {
      assert(err.message.includes("must have required property 'name'"));
    }
  },
});

Deno.test({
  name: "GET /user | get user information",
  async fn() {
    const storage = {
      async getUser() {
        return {
          name: "bob",
          role: "admin",
          created: 123,
        };
      },
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
        name: "bob",
      },
    });

    await getUser(config, {
      storage: storage as any,
      logger: {
        addActivity() {
          return Promise.resolve();
        },
        addException() {
          return Promise.resolve();
        },
      },
      schema: validateSchema,
    })(ctx);
  },
});
