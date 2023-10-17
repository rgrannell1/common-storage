import { assert } from "https://deno.land/std@0.198.0/assert/mod.ts";

import { Context, validateSchema } from "../shared/test-utils.ts";

import { postRole } from "./role-post.ts";

import { Permission } from "../types.ts";

const config = {
  port: 8080,
};

Deno.test({
  name: "GET /content",
  async fn() {
  },
});
