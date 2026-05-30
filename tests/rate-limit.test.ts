// Integration tests for rate-limiting middleware
// @work.md

import { makePersistentServer, discard } from "./helpers.ts";

const LOW_IP_LIMIT = 3;
const LOW_GLOBAL_LIMIT = 3;

Deno.test("Proves requests below the per-IP limit are allowed", async () => {
  const { fetch, cleanup } = await makePersistentServer([], [], {
    ipLimit: LOW_IP_LIMIT,
    globalLimit: 10_000,
  });
  try {
    for (let idx = 0; idx < LOW_IP_LIMIT; idx++) {
      const res = await fetch("/feed");
      const rateLimitMsg = `Request ${idx + 1} was rate-limited before limit reached`;
      if (res.status === 429) throw new Error(rateLimitMsg);
      await discard(res);
    }
  } finally {
    await cleanup();
  }
});

Deno.test("Proves the per-IP limit returns 429 once exceeded", async () => {
  const { fetch, cleanup } = await makePersistentServer([], [], {
    ipLimit: LOW_IP_LIMIT,
    globalLimit: 10_000,
  });
  try {
    for (let idx = 0; idx < LOW_IP_LIMIT; idx++) {
      await discard(await fetch("/feed"));
    }
    const res = await fetch("/feed");
    if (res.status !== 429) throw new Error(`Expected 429, got ${res.status}`);
    await discard(res);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves requests below the global limit are allowed", async () => {
  const { fetch, cleanup } = await makePersistentServer([], [], {
    ipLimit: 10_000,
    globalLimit: LOW_GLOBAL_LIMIT,
  });
  try {
    for (let idx = 0; idx < LOW_GLOBAL_LIMIT; idx++) {
      const res = await fetch("/feed");
      const globalLimitMsg = `Request ${idx + 1} was rate-limited before global limit reached`;
      if (res.status === 429) throw new Error(globalLimitMsg);
      await discard(res);
    }
  } finally {
    await cleanup();
  }
});

Deno.test("Proves the global limit returns 429 once exceeded", async () => {
  const { fetch, cleanup } = await makePersistentServer([], [], {
    ipLimit: 10_000,
    globalLimit: LOW_GLOBAL_LIMIT,
  });
  try {
    for (let idx = 0; idx < LOW_GLOBAL_LIMIT; idx++) {
      await discard(await fetch("/feed"));
    }
    const res = await fetch("/feed");
    if (res.status !== 429) throw new Error(`Expected 429, got ${res.status}`);
    await discard(res);
  } finally {
    await cleanup();
  }
});
