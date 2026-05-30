// Integration tests for PUT /events/:topic/:id
// @work.md

import { makeTestContext, makePersistentServer, discard, jsonPost, jsonPut } from "./helpers.ts";

type InvalidPayloadCase = {
  label: string;
  body: unknown;
};

const INVALID_PUT_EVENT_PAYLOAD_CASES: InvalidPayloadCase[] = [
  { label: "missing payload key", body: {} },
  { label: "null payload",        body: { payload: null } },
];

for (const { label, body } of INVALID_PUT_EVENT_PAYLOAD_CASES) {
  Deno.test(`Proves PUT /events/:topic/:id rejects ${label} with 400`, async () => {
    const { request, cleanup } = await makeTestContext([{ name: "logs" }]);
    try {
      const res = await request("/events/logs/1", jsonPut(body));
      res.expectStatus(400);
    } finally {
      await cleanup();
    }
  });
}

Deno.test("Proves PUT /events/:topic/:id returns 404 for an unknown topic", async () => {
  const { request, cleanup } = await makeTestContext();
  try {
    const res = await request("/events/nonexistent/1", jsonPut({ payload: {} }));
    res.expectStatus(404);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves PUT /events/:topic/:id creates entry at specific ID when absent", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "logs" }]);
  try {
    const res = await fetch("/events/logs/500", jsonPut({ payload: { value: 1 } }));
    const entry = await res.json() as { id: number; payload: { value: number } };

    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
    if (entry.id !== 500) throw new Error(`Expected id 500, got ${entry.id}`);
  } finally {
    await cleanup();
  }
});

Deno.test(
  "Proves PUT /events/:topic/:id advances counter so subsequent writes avoid collision",
  async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "logs" }]);
  try {
    await discard(await fetch("/events/logs/500", jsonPut({ payload: {} })));

    const res = await fetch("/events/logs", jsonPost({ payload: {} }));
    const entry = await res.json() as { id: number };

    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
    if (entry.id <= 500) throw new Error(`Expected id > 500, got ${entry.id}`);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves PUT /events/:topic/:id returns 200 and updates the entry", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "logs" }]);
  try {
    await discard(await fetch("/events/logs", jsonPost({ payload: { value: 1 } })));

    const res = await fetch("/events/logs/1", jsonPut({ payload: { value: 2 } }));
    const entry = await res.json() as { payload: { value: number } };

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const payloadValue = entry.payload.value;
    if (payloadValue !== 2) throw new Error(`Expected payload.value 2, got ${payloadValue}`);
  } finally {
    await cleanup();
  }
});

Deno.test("Proves PUT /events/:topic/:id GET after update reflects new payload", async () => {
  const { fetch, cleanup } = await makePersistentServer([{ name: "logs" }]);
  try {
    await discard(await fetch("/events/logs", jsonPost({ payload: { value: 1 } })));
    await discard(await fetch("/events/logs/1", jsonPut({ payload: { value: 2 } })));

    const res = await fetch("/events/logs/1");
    const entry = await res.json() as { payload: { value: number } };

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const updatedValue = entry.payload.value;
    if (updatedValue !== 2) {
      throw new Error(`Expected payload.value 2 after update, got ${updatedValue}`);
    }
  } finally {
    await cleanup();
  }
});
