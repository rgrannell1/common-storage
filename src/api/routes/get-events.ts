// GET /events/:topic — returns a paginated list of entries from an event topic
// @design.md

import { z } from "zod";
import { ok, err, type Result } from "../../commons/types/result.ts";
import type { Route } from "../../commons/types/parser.ts";
import type { RouteError, RouteSuccess } from "../../commons/types/responses.ts";
import { pathParamParser, queryParser, mergeParser, responseParser } from "../parsers/combinators.ts";
import { TopicNameSchema, EventEntrySchema, QueryStartSchema, QuerySizeSchema, QueryIdsSchema } from "../parsers/schemas.ts";
import { DEFAULT_PAGE_SIZE } from "../../commons/constants.ts";
import type { IReadEvents, EventEntry } from "../storage/capabilities.ts";

const GetEventsPathSchema = z.object({
  topic: TopicNameSchema,
});

const GetEventsQuerySchema = z.object({
  start: QueryStartSchema.optional(),
  size: QuerySizeSchema.optional(),
  ids: QueryIdsSchema.optional(),
});

type GetEventsRequest = z.infer<typeof GetEventsPathSchema> & z.infer<typeof GetEventsQuerySchema>;

type GetEventsDeps = {
  storage: IReadEvents;
};

const GetEventsResponseSchema = z.array(EventEntrySchema);

type GetEventsResponse = z.infer<typeof GetEventsResponseSchema>;

async function getEvents(deps: GetEventsDeps, params: GetEventsRequest): Promise<Result<GetEventsResponse, RouteError>> {
  const entries = await deps.storage.readEvents(params.topic, {
    start: params.start,
    size: params.size ?? DEFAULT_PAGE_SIZE,
    ids: params.ids,
  });

  if (entries === null) {
    return err({ kind: "not_found", resource: params.topic });
  }

  return ok(entries);
}

export function getEventsRoute(deps: GetEventsDeps): Route<null, GetEventsRequest, GetEventsResponse, RouteSuccess, RouteError> {
  return {
    parseRequest: mergeParser(pathParamParser(GetEventsPathSchema), queryParser(GetEventsQuerySchema)),
    handle: getEvents.bind(null, deps),
    parseResponse: responseParser(GetEventsResponseSchema),
  };
}
