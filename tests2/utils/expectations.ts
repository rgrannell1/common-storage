import { Test } from "https://deno.land/x/superdeno/mod.ts";
import {
  assert,
  assertEquals,
  assertObjectMatch,
} from "https://deno.land/std@0.159.0/testing/asserts.ts";

import { Status } from "https://deno.land/std/http/http_status.ts";

export class RequestExpectations {
  static jsonContentType(req: Test) {
    req.expect("Content-Type", "application/json; charset=utf-8");
  }
  static unauthenticatedFailure(req: Test) {
    req.expect(Status.Unauthorized);
  }
  static notFound(req: Test) {
    req.expect(Status.NotFound);
  }
  static ok(req: Test) {
    req.expect(Status.OK);
  }
}

export class BodyExpectations {
  static storedContent(expected: any[], actual: any[]) {
    // assert retrieved-content matches
    assert(actual.length === expected.length, `mismatched expected length`);
    for (let idx = 0; idx < actual.length; ++idx) {
      assertEquals(actual[idx].id - 1, idx);
      assertEquals(actual[idx].value.name, expected[idx].name);
      assert(actual[idx].hasOwnProperty("created"));
    }
  }
}
