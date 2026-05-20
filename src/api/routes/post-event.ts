// POST /events/:topic — writes a new entry to an event topic
// @work.md

import { z } from "zod";
import { ok, err, type Result } from "../../commons/types/result.ts";
import type { Route } from "../../commons/types/parser.ts";
import type { RouteError, RouteSuccess } from "../../commons/types/responses.ts";
import { pathParamParser, bodyParser, mergeAll, idempotencyKeyParser, responseParser } from "../parsers/combinators.ts";
import { TopicNameSchema, EventEntrySchema } from "../parsers/schemas.ts";
import type { IWriteEvent, IReadIdempotencyEntry, IWriteIdempotencyEntry, EventEntry } from "../storage/capabilities.ts";

const PostEventPathSchema = z.object({
  topic: TopicNameSchema,
});

const PostEventBodySchema = z.object({
  payload: z.unknown(),
});

type PostEventRequest = z.infer<typeof PostEventPathSchema> & z.infer<typeof PostEventBodySchema> & { idempotencyKey: string | undefined };

type PostEventDeps = {
  storage: IWriteEvent & IReadIdempotencyEntry & IWriteIdempotencyEntry;
};

async function postEvent(deps: PostEventDeps, params: PostEventRequest): Promise<Result<EventEntry, RouteError>> {
  if (params.idempotencyKey !== undefined) {
    const cached = await deps.storage.readIdempotencyEntry(params.topic, params.idempotencyKey);
    if (cached !== null) {
      return ok(cached as EventEntry);
    }
  }

  const entry = await deps.storage.writeEvent(params.topic, params.payload);
  if (entry === null) {
    return err({ kind: "not_found", resource: params.topic });
  }

  if (params.idempotencyKey !== undefined) {
    await deps.storage.writeIdempotencyEntry(params.topic, params.idempotencyKey, entry);
  }

  return ok(entry);
}

export function postEventRoute(deps: PostEventDeps): Route<unknown, PostEventRequest, EventEntry, RouteSuccess, RouteError> {
  return {
    parseRequest: mergeAll(pathParamParser(PostEventPathSchema), bodyParser(PostEventBodySchema), idempotencyKeyParser()),
    handle: postEvent.bind(null, deps),
    parseResponse: responseParser(EventEntrySchema, "created"),
  };
}
