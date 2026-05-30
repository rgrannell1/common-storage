// Payload size tests — proves writes exceeding the storage value-size limit are rejected with 422
// @work.md

import { assertEquals } from "@std/assert";
import { makeTestContext, jsonPost, jsonPut } from "./helpers.ts";
import { MAX_PAYLOAD_BYTES } from "../src/commons/constants.ts";

// A payload whose JSON encoding comfortably exceeds the per-value limit.
const OVERSIZED_PAYLOAD = { blob: "x".repeat(MAX_PAYLOAD_BYTES + 1_000) };

type WriteCase = {
  label: string;
  event: boolean;
  path: string;
  init: RequestInit;
};

const oversizedBody = { payload: OVERSIZED_PAYLOAD };

const CASES: WriteCase[] = [
  { label: "POST /events/:topic", event: true, path: "/events/big", init: jsonPost(oversizedBody) },
  {
    label: "PUT /events/:topic/:id",
    event: true,
    path: "/events/big/1",
    init: jsonPut(oversizedBody),
  },
  {
    label: "PUT /objects/:topic/:id",
    event: false,
    path: "/objects/big/obj1",
    init: jsonPut(oversizedBody),
  },
];

const testTitle = (label: string) => `Proves ${label} returns 422 for an oversized payload`;

for (const testCase of CASES) {
  Deno.test(testTitle(testCase.label), async () => {
    const { request, cleanup } = testCase.event
      ? await makeTestContext([{ name: "big" }])
      : await makeTestContext([], [{ name: "big" }]);
    const res = await request(testCase.path, testCase.init);
    assertEquals(res.status, 422);
    await cleanup();
  });
}
