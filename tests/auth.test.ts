// Integration tests — proves every route rejects requests with no token
// @work.md

import { makeUnauthContext, discard } from "./helpers.ts";

type RouteCase = {
  method: string;
  path: string;
};

const ROUTES: RouteCase[] = [
  { method: "GET",    path: "/feed" },
  { method: "GET",    path: "/events/test" },
  { method: "GET",    path: "/events/test/1" },
  { method: "POST",   path: "/events/test" },
  { method: "PUT",    path: "/events/test/1" },
  { method: "GET",    path: "/objects/test" },
  { method: "GET",    path: "/objects/test/abc" },
  { method: "PUT",    path: "/objects/test/abc" },
  { method: "DELETE", path: "/objects/test/abc" },
  { method: "POST",   path: "/diff/test" },
];

Deno.test("Proves every route returns 401 when no token is provided", async () => {
  const { fetch, cleanup } = await makeUnauthContext();
  try {
    for (const { method, path } of ROUTES) {
      const res = await fetch(path, { method });
      await discard(res);
      if (res.status !== 401) {
        throw new Error(`Expected 401 on ${method} ${path}, got ${res.status}`);
      }
    }
  } finally {
    await cleanup();
  }
});
