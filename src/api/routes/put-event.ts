// PUT /events/:topic/:id — updates the payload of an existing event topic entry
// @design.md

import { z } from "zod";
import { ok, err, type Result } from "../../commons/types/result.ts";
import type { Route } from "../../commons/types/parser.ts";
import type { RouteError, RouteSuccess } from "../../commons/types/responses.ts";
import { pathParamParser, bodyParser, mergeParser, responseParser } from "../parsers/combinators.ts";
import { TopicNameSchema, EventEntrySchema } from "../parsers/schemas.ts";
import type { IUpdateEvent, EventEntry } from "../storage/capabilities.ts";

const PutEventPathSchema = z.object({
  topic: TopicNameSchema,
  id: z.coerce.number().int().positive(),
});

const PutEventBodySchema = z.object({
  payload: z.unknown(),
});

type PutEventRequest = z.infer<typeof PutEventPathSchema> & z.infer<typeof PutEventBodySchema>;

type PutEventDeps = {
  storage: IUpdateEvent;
};

async function putEvent(deps: PutEventDeps, params: PutEventRequest): Promise<Result<EventEntry, RouteError>> {
  const entry = await deps.storage.updateEvent(params.topic, params.id, params.payload);

  if (entry === null) {
    return err({ kind: "not_found", resource: `${params.topic}/${params.id}` });
  }

  return ok(entry);
}

export function putEventRoute(deps: PutEventDeps): Route<unknown, PutEventRequest, EventEntry, RouteSuccess, RouteError> {
  return {
    parseRequest: mergeParser(pathParamParser(PutEventPathSchema), bodyParser(PutEventBodySchema)),
    handle: putEvent.bind(null, deps),
    parseResponse: responseParser(EventEntrySchema),
  };
}
