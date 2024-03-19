import { assert } from "../dev_deps.ts";
import { Context, validateSchema } from "../shared/test-utils.ts";

import { getUser } from "./user-get.ts";

const config = {
  port: 8080,
};

Deno.test({
  name: "GET /user | invalid requests fail as expected",
  async fn() {
    const storage = {
      getUser() {
        return Promise.resolve([]);
      },
      getRole() {
        return Promise.resolve({
          created: 1234,
          permissions: [{
            routes: "ALL",
            topics: "ALL",
          }],
        });
      },
    };

    const ctx = Context({
      params: {},
    });

    try {
      await getUser(config, {
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
      assert(err.message.includes("must have required property 'name'"));
    }
  },
});

Deno.test({
  name: "GET /user | get user information",
  async fn() {
    const storage = {
      getUser() {
        return Promise.resolve({
          name: "bob",
          role: "admin",
          created: 123,
        });
      },
      getRole() {
        return Promise.resolve({
          created: 1234,
          permissions: [{
            routes: "ALL",
            topics: "ALL",
          }],
        });
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
        info() {
          return Promise.resolve();
        },
        error() {
          return Promise.resolve();
        },
      },
      schema: validateSchema,
    })(ctx);
  },
});
