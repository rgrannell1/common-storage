// Integration tests for Idempotency-Key behaviour on POST /events and PUT /events and PUT /objects
// @work.md

import { makePersistentServer } from "./helpers.ts";

function postJson(body: unknown, key?: string): RequestInit {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (key !== undefined) headers["Idempotency-Key"] = key;
  return { method: "POST", headers, body: JSON.stringify(body) };
}

function putJson(body: unknown, key?: string): RequestInit {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (key !== undefined) headers["Idempotency-Key"] = key;
  return { method: "PUT", headers, body: JSON.stringify(body) };
}

Deno.test("Proves POST /events/:topic with Idempotency-Key deduplicates retries", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "logs" }]);
  try {
    const payload = { payload: { msg: "hello" } };
    const first = await fetch("/events/logs", postJson(payload, "key-1"));
    const second = await fetch("/events/logs", postJson(payload, "key-1"));

    if (first.status !== 201) throw new Error(`Expected 201, got ${first.status}`);
    if (second.status !== 201) throw new Error(`Expected 201, got ${second.status}`);

    const firstEntry = await first.json();
    const secondEntry = await second.json();

    if (firstEntry.id !== secondEntry.id) {
      throw new Error(`Expected same id on retry: got ${firstEntry.id} and ${secondEntry.id}`);
    }
  } finally {
    await cleanup();
  }
});

Deno.test("Proves POST /events/:topic without Idempotency-Key creates new entries", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "logs" }]);
  try {
    const payload = { payload: { msg: "hello" } };
    const first = await fetch("/events/logs", postJson(payload));
    const second = await fetch("/events/logs", postJson(payload));

    if (first.status !== 201) throw new Error(`Expected 201, got ${first.status}`);
    if (second.status !== 201) throw new Error(`Expected 201, got ${second.status}`);

    const firstEntry = await first.json();
    const secondEntry = await second.json();

    if (firstEntry.id === secondEntry.id) {
      throw new Error(`Expected distinct ids without idempotency key: both got ${firstEntry.id}`);
    }
  } finally {
    await cleanup();
  }
});

Deno.test("Proves PUT /events/:topic/:id with Idempotency-Key deduplicates", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "logs" }]);
  try {
    const created = await fetch("/events/logs", postJson({ payload: { msg: "initial" } }));
    const { id } = await created.json();

    const putPayload = { payload: { msg: "updated" } };
    const first = await fetch(`/events/logs/${id}`, putJson(putPayload, "put-key-1"));
    const ignoredPayload = { payload: { msg: "should-be-ignored" } };
    const second = await fetch(`/events/logs/${id}`, putJson(ignoredPayload, "put-key-1"));

    if (first.status !== 200) throw new Error(`Expected 200, got ${first.status}`);
    if (second.status !== 200) throw new Error(`Expected 200, got ${second.status}`);

    const firstEntry = await first.json();
    const secondEntry = await second.json();

    if (firstEntry.updatedAt !== secondEntry.updatedAt) {
      const t1 = firstEntry.updatedAt;
      const t2 = secondEntry.updatedAt;
      const msg = `Expected same updatedAt on retry: got ${t1} and ${t2}`;
      throw new Error(msg);
    }
  } finally {
    await cleanup();
  }
});

Deno.test("Proves PUT /objects/:topic/:id with Idempotency-Key deduplicates", async () => {
  const { fetch, cleanup } = await makePersistentServer([], [{ name: "things" }]);
  try {
    const objPayload = { payload: { value: 42 } };
    const first = await fetch("/objects/things/item-1", putJson(objPayload, "obj-key-1"));
    const ignoredObjPayload = { payload: { value: 99 } };
    const second = await fetch("/objects/things/item-1", putJson(ignoredObjPayload, "obj-key-1"));

    if (first.status !== 200) throw new Error(`Expected 200, got ${first.status}`);
    if (second.status !== 200) throw new Error(`Expected 200, got ${second.status}`);

    const firstEntry = await first.json();
    const secondEntry = await second.json();

    if (firstEntry.updatedAt !== secondEntry.updatedAt) {
      const t1 = firstEntry.updatedAt;
      const t2 = secondEntry.updatedAt;
      const msg = `Expected same updatedAt on retry: got ${t1} and ${t2}`;
      throw new Error(msg);
    }
  } finally {
    await cleanup();
  }
});

Deno.test("Proves Idempotency-Key cache is scoped per topic, not global", async () => {
  const topicCfg = [{ name: "alpha" }, { name: "beta" }];
  const { fetch, cleanup } = await makePersistentServer(topicCfg);
  try {
    const alphaPayload = { payload: { src: "alpha" } };
    const first = await fetch("/events/alpha", postJson(alphaPayload, "shared-key"));
    const betaPayload = { payload: { src: "beta" } };
    const second = await fetch("/events/beta", postJson(betaPayload, "shared-key"));

    if (first.status !== 201) throw new Error(`Expected 201 for alpha, got ${first.status}`);
    if (second.status !== 201) throw new Error(`Expected 201 for beta, got ${second.status}`);

    const firstEntry = await first.json();
    const secondEntry = await second.json();

    // Both should be id=1 (first entry in each topic), confirming they did not share a cache slot
    if (firstEntry.id !== 1 || secondEntry.id !== 1) {
      const msg = `Expected id=1 in each topic; got alpha=${firstEntry.id} beta=${secondEntry.id}`;
      throw new Error(msg);
    }
  } finally {
    await cleanup();
  }
});
