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

Deno.test("Proves POST /events/:topic with Idempotency-Key creates only one entry on retry", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "logs" }]);
  try {
    const first = await fetch("/events/logs", postJson({ payload: { msg: "hello" } }, "key-1"));
    const second = await fetch("/events/logs", postJson({ payload: { msg: "hello" } }, "key-1"));

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

Deno.test("Proves POST /events/:topic without Idempotency-Key writes a new entry each time", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "logs" }]);
  try {
    const first = await fetch("/events/logs", postJson({ payload: { msg: "hello" } }));
    const second = await fetch("/events/logs", postJson({ payload: { msg: "hello" } }));

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

Deno.test("Proves PUT /events/:topic/:id with Idempotency-Key does not overwrite on retry", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "logs" }]);
  try {
    const created = await fetch("/events/logs", postJson({ payload: { msg: "initial" } }));
    const { id } = await created.json();

    const first = await fetch(`/events/logs/${id}`, putJson({ payload: { msg: "updated" } }, "put-key-1"));
    const second = await fetch(`/events/logs/${id}`, putJson({ payload: { msg: "should-be-ignored" } }, "put-key-1"));

    if (first.status !== 200) throw new Error(`Expected 200, got ${first.status}`);
    if (second.status !== 200) throw new Error(`Expected 200, got ${second.status}`);

    const firstEntry = await first.json();
    const secondEntry = await second.json();

    if (firstEntry.updatedAt !== secondEntry.updatedAt) {
      throw new Error(`Expected same updatedAt on retry: got ${firstEntry.updatedAt} and ${secondEntry.updatedAt}`);
    }
  } finally {
    await cleanup();
  }
});

Deno.test("Proves PUT /objects/:topic/:id with Idempotency-Key does not overwrite on retry", async () => {
  const { fetch, cleanup } = await makePersistentServer([], [{ name: "things" }]);
  try {
    const first = await fetch("/objects/things/item-1", putJson({ payload: { value: 42 } }, "obj-key-1"));
    const second = await fetch("/objects/things/item-1", putJson({ payload: { value: 99 } }, "obj-key-1"));

    if (first.status !== 200) throw new Error(`Expected 200, got ${first.status}`);
    if (second.status !== 200) throw new Error(`Expected 200, got ${second.status}`);

    const firstEntry = await first.json();
    const secondEntry = await second.json();

    if (firstEntry.updatedAt !== secondEntry.updatedAt) {
      throw new Error(`Expected same updatedAt on retry: got ${firstEntry.updatedAt} and ${secondEntry.updatedAt}`);
    }
  } finally {
    await cleanup();
  }
});

Deno.test("Proves Idempotency-Key is scoped per topic — same key on different topics writes independently", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "alpha" }, { name: "beta" }]);
  try {
    const first = await fetch("/events/alpha", postJson({ payload: { src: "alpha" } }, "shared-key"));
    const second = await fetch("/events/beta", postJson({ payload: { src: "beta" } }, "shared-key"));

    if (first.status !== 201) throw new Error(`Expected 201 for alpha, got ${first.status}`);
    if (second.status !== 201) throw new Error(`Expected 201 for beta, got ${second.status}`);

    const firstEntry = await first.json();
    const secondEntry = await second.json();

    // Both should be id=1 (first entry in each topic), confirming they did not share a cache slot
    if (firstEntry.id !== 1 || secondEntry.id !== 1) {
      throw new Error(`Expected id=1 in each topic; got alpha=${firstEntry.id} beta=${secondEntry.id}`);
    }
  } finally {
    await cleanup();
  }
});
