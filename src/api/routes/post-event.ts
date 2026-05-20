// POST /events/:topic — writes a new entry to an event topic
// @design.md

import { z } from "zod";
import { ok, err, type Result } from "../../commons/types/result.ts";
import type { Route } from "../../commons/types/parser.ts";
import type { RouteError, RouteSuccess } from "../../commons/types/responses.ts";
import { pathParamParser, bodyParser, mergeParser, responseParser } from "../parsers/combinators.ts";
import { TopicNameSchema, EventEntrySchema } from "../parsers/schemas.ts";
import type { IWriteEvent, EventEntry } from "../storage/capabilities.ts";

const PostEventPathSchema = z.object({
  topic: TopicNameSchema,
});

const PostEventBodySchema = z.object({
  payload: z.unknown(),
});

type PostEventRequest = z.infer<typeof PostEventPathSchema> & z.infer<typeof PostEventBodySchema>;

type PostEventDeps = {
  storage: IWriteEvent;
};

async function postEvent(deps: PostEventDeps, params: PostEventRequest): Promise<Result<EventEntry, RouteError>> {
  const entry = await deps.storage.writeEvent(params.topic, params.payload);
  if (entry === null) {
    return err({ kind: "not_found", resource: params.topic });
  }
  return ok(entry);
}

export function postEventRoute(deps: PostEventDeps): Route<unknown, PostEventRequest, EventEntry, RouteSuccess, RouteError> {
  return {
    parseRequest: mergeParser(pathParamParser(PostEventPathSchema), bodyParser(PostEventBodySchema)),
    handle: postEvent.bind(null, deps),
    parseResponse: responseParser(EventEntrySchema, "created"),
  };
}
