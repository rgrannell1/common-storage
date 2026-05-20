// PUT /events/:topic/:id — updates the payload of an existing event topic entry
// @work.md

import { z } from "zod";
import { ok, err, type Result } from "../../commons/types/result.ts";
import type { Route } from "../../commons/types/parser.ts";
import type { RouteError, RouteSuccess } from "../../commons/types/responses.ts";
import { pathParamParser, bodyParser, mergeAll, idempotencyKeyParser, responseParser } from "../parsers/combinators.ts";
import { TopicNameSchema, EventEntrySchema } from "../parsers/schemas.ts";
import type { IUpdateEvent, IReadIdempotencyEntry, IWriteIdempotencyEntry, EventEntry } from "../storage/capabilities.ts";

const PutEventPathSchema = z.object({
  topic: TopicNameSchema,
  id: z.coerce.number().int().positive(),
});

const PutEventBodySchema = z.object({
  payload: z.unknown(),
});

type PutEventRequest = z.infer<typeof PutEventPathSchema> & z.infer<typeof PutEventBodySchema> & { idempotencyKey: string | undefined };

type PutEventDeps = {
  storage: IUpdateEvent & IReadIdempotencyEntry & IWriteIdempotencyEntry;
};

async function putEvent(deps: PutEventDeps, params: PutEventRequest): Promise<Result<EventEntry, RouteError>> {
  if (params.idempotencyKey !== undefined) {
    const cached = await deps.storage.readIdempotencyEntry(params.topic, params.idempotencyKey);
    if (cached !== null) {
      return ok(cached as EventEntry);
    }
  }

  const entry = await deps.storage.updateEvent(params.topic, params.id, params.payload);
  if (entry === null) {
    return err({ kind: "not_found", resource: `${params.topic}/${params.id}` });
  }

  if (params.idempotencyKey !== undefined) {
    await deps.storage.writeIdempotencyEntry(params.topic, params.idempotencyKey, entry);
  }

  return ok(entry);
}

export function putEventRoute(deps: PutEventDeps): Route<unknown, PutEventRequest, EventEntry, RouteSuccess, RouteError> {
  return {
    parseRequest: mergeAll(pathParamParser(PutEventPathSchema), bodyParser(PutEventBodySchema), idempotencyKeyParser()),
    handle: putEvent.bind(null, deps),
    parseResponse: responseParser(EventEntrySchema),
  };
}
