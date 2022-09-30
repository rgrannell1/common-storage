import { assertEquals } from "https://deno.land/std@0.129.0/testing/asserts.ts";
import {
  assert,
  assertObjectMatch,
} from "https://deno.land/std@0.158.0/testing/asserts.ts";
import { IStorage } from "../../src/interfaces/storage.ts";

export function jsonContentType(req: any) {
  assertEquals(req.headers["content-type"], "application/json; charset=utf-8");
}

export function unauthenticatedFailure(req: any) {
  assertObjectMatch(req.body, {
    error: {
      message: "Not authorized",
    },
  });

  assert(req.status === 401, "unexpected status code");
}

export async function missingTopicFailure(topic: string, storage: IStorage) {
  try {
    const topics = await storage.getTopic(topic);
    throw new Error("did not throw exception for missing topic");
  } catch (err) {}
}
