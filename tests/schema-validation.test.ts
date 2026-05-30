// Schema validation tests — proves that topic payload schemas are enforced on writes
// @work.md

import { assertEquals } from "@std/assert";
import { makeTestContext, jsonPost, jsonPut } from "./helpers.ts";

const SCHEMA_PATH = await Deno.makeTempFile({ suffix: ".json" });
await Deno.writeTextFile(SCHEMA_PATH, JSON.stringify({
  type: "object",
  properties: { name: { type: "string" } },
  required: ["name"],
  additionalProperties: false,
}));

Deno.test(
  "Proves POST /events/:topic returns 201 for a payload matching the topic schema",
  async () => {
  const { request, cleanup } = await makeTestContext([{ name: "typed", schema: SCHEMA_PATH }]);
  const res = await request("/events/typed", jsonPost({ payload: { name: "hello" } }));
  assertEquals(res.status, 201);
  await cleanup();
});

Deno.test(
  "Proves POST /events/:topic returns 422 for a payload violating the topic schema",
  async () => {
  const { request, cleanup } = await makeTestContext([{ name: "typed", schema: SCHEMA_PATH }]);
  const res = await request("/events/typed", jsonPost({ payload: { name: 42 } }));
  assertEquals(res.status, 422);
  await cleanup();
});

Deno.test("Proves POST /events/:topic with no schema accepts any JSON payload", async () => {
  const { request, cleanup } = await makeTestContext([{ name: "untyped" }]);
  const res = await request("/events/untyped", jsonPost({ payload: { anything: true } }));
  assertEquals(res.status, 201);
  await cleanup();
});

Deno.test(
  "Proves PUT /events/:topic/:id returns 422 for a payload violating the topic schema",
  async () => {
  const { request, cleanup } = await makeTestContext([{ name: "typed", schema: SCHEMA_PATH }]);
  const res = await request("/events/typed/1", jsonPut({ payload: { name: 99 } }));
  assertEquals(res.status, 422);
  await cleanup();
});

Deno.test(
  "Proves PUT /objects/:topic/:id returns 422 for a payload violating the topic schema",
  async () => {
  const { request, cleanup } = await makeTestContext([], [{ name: "typed", schema: SCHEMA_PATH }]);
  const res = await request("/objects/typed/obj1", jsonPut({ payload: { name: 99 } }));
  assertEquals(res.status, 422);
  await cleanup();
});

Deno.test(
  "Proves PUT /objects/:topic/:id returns 200 for a payload matching the topic schema",
  async () => {
  const { request, cleanup } = await makeTestContext([], [{ name: "typed", schema: SCHEMA_PATH }]);
  const res = await request("/objects/typed/obj1", jsonPut({ payload: { name: "valid" } }));
  assertEquals(res.status, 200);
  await cleanup();
});
