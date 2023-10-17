import { assert } from "https://deno.land/std@0.198.0/assert/mod.ts";

import { Context, validateSchema } from "../shared/test-utils.ts";
import { adminAccess } from "./authentication.ts";

Deno.test({
  name: "Authentication | administrator access fails when not provided",
  async fn() {
    const ctx = Context({});

    const route = adminAccess({} as any, {
      storage: {} as any,
      logger: {
        addActivity() {
          return Promise.resolve();
        },
        addException(err) {
          return Promise.resolve();
        },
      },
      schema: validateSchema,
    });

    await route(ctx, () => {});
    assert(ctx.response.status === 401);
    assert(
      ctx.response.body === JSON.stringify({
        error: "Administrator authentication is not configured",
      }),
    );
  },
});

Deno.test({
  name: "Authentication | fails for invalid basic authentication headers",
  async fn() {
    const ctx = Context({
      headers: new Headers({
        "Authorization": "Flimpy Stroodle",
      }),
    });

    const route = adminAccess({
      adminUsername: "admin",
      adminPassword: "admin",
    } as any, {
      storage: {} as any,
      logger: {
        addActivity() {
          return Promise.resolve();
        },
        addException(err) {
          return Promise.resolve();
        },
      },
      schema: validateSchema,
    });

    await route(ctx, () => {});

    assert(ctx.response.status === 401);
    assert(
      ctx.response.body === JSON.stringify({
        error: "Incorrect credentials for administrator account",
      }),
    );
  },
});

Deno.test({
  name: "Authentication | fails for invalid credentials ",
  async fn() {
    const ctx = Context({
      headers: new Headers({
        "Authorization": `Basic ${btoa("admin:notcorrect")}`,
      }),
    });

    const route = adminAccess({
      adminUsername: "admin",
      adminPassword: "admin",
    } as any, {
      storage: {} as any,
      logger: {
        addActivity() {
          return Promise.resolve();
        },
        addException(err) {
          return Promise.resolve();
        },
      },
      schema: validateSchema,
    });

    await route(ctx, () => {});

    assert(ctx.response.status === 401);
    assert(
      JSON.parse(ctx.response.body).error ===
        "Incorrect credentials for administrator account",
    );
  },
});

Deno.test({
  name: "Authentication | passes for valid credentials",
  async fn() {
    const ctx = Context({
      headers: new Headers({
        "Authorization": `Basic ${btoa("admin:admin")}`,
      }),
    });

    const route = adminAccess({
      adminUsername: "admin",
      adminPassword: "admin",
    } as any, {
      storage: {} as any,
      logger: {
        addActivity() {
          return Promise.resolve();
        },
        addException(err) {
          return Promise.resolve();
        },
      },
      schema: validateSchema,
    });

    await route(ctx, (ctx: any) => {
      assert(ctx.state.user === "admin");
      assert(ctx.state.authenticationMethod === "admin");
    });
  },
});
