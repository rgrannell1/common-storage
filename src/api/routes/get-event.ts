// GET /events/:topic/:id — returns a single entry from an event topic
// @design.md

import { z } from "zod";
import { ok, err, type Result } from "../../commons/types/result.ts";
import type { Route } from "../../commons/types/parser.ts";
import type { RouteError, RouteSuccess } from "../../commons/types/responses.ts";
import { pathParamParser, responseParser } from "../parsers/combinators.ts";
import { TopicNameSchema, EventEntrySchema } from "../parsers/schemas.ts";
import type { IReadEvent, EventEntry } from "../storage/capabilities.ts";

const GetEventPathSchema = z.object({
  topic: TopicNameSchema,
  id: z.coerce.number().int().positive(),
});

type GetEventRequest = z.infer<typeof GetEventPathSchema>;

type GetEventDeps = {
  storage: IReadEvent;
};

async function getEvent(deps: GetEventDeps, params: GetEventRequest): Promise<Result<EventEntry, RouteError>> {
  const entry = await deps.storage.readEvent(params.topic, params.id);

  if (entry === null) {
    return err({ kind: "not_found", resource: `${params.topic}/${params.id}` });
  }

  return ok(entry);
}

export function getEventRoute(deps: GetEventDeps): Route<null, GetEventRequest, EventEntry, RouteSuccess, RouteError> {
  return {
    parseRequest: pathParamParser(GetEventPathSchema),
    handle: getEvent.bind(null, deps),
    parseResponse: responseParser(EventEntrySchema),
  };
}
