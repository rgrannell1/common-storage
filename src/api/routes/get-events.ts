// GET /events/:topic — returns a paginated list of entries from an event topic
// @work.md

import { z } from "zod";
import { ok, err, type Result } from "../../commons/types/result.ts";
import type { Route } from "../../commons/types/parser.ts";
import type { RouteError, RouteSuccess } from "../../commons/types/responses.ts";
import { pathParamParser, queryParser, mergeParser, responseParser } from "../parsers/combinators.ts";
import { TopicNameSchema, EventEntrySchema, QueryStartSchema, QuerySizeSchema, QueryIdsSchema, QueryFilterSchema } from "../parsers/schemas.ts";
import { applyFilter } from "../parsers/filter.ts";
import { DEFAULT_PAGE_SIZE } from "../../commons/constants.ts";
import type { IReadEvents, EventEntry } from "../storage/capabilities.ts";

const GetEventsPathSchema = z.object({
  topic: TopicNameSchema,
});

const GetEventsQuerySchema = z.object({
  start: QueryStartSchema.optional(),
  size: QuerySizeSchema.optional(),
  ids: QueryIdsSchema.optional(),
  filter: QueryFilterSchema.optional(),
});

type GetEventsRequest = z.infer<typeof GetEventsPathSchema> & z.infer<typeof GetEventsQuerySchema>;

type GetEventsDeps = {
  storage: IReadEvents;
};

const GetEventsResponseSchema = z.object({
  entries: z.array(EventEntrySchema),
  // ID to pass as ?start= on the next request; null when the topic is exhausted
  next: z.number().int().positive().nullable(),
});

type GetEventsResponse = z.infer<typeof GetEventsResponseSchema>;

async function getEvents(deps: GetEventsDeps, params: GetEventsRequest): Promise<Result<GetEventsResponse, RouteError>> {
  const size = params.size ?? DEFAULT_PAGE_SIZE;
  const fetched = await deps.storage.readEvents(params.topic, {
    start: params.start,
    size,
    ids: params.ids,
  });

  if (fetched === null) {
    return err({ kind: "not_found", resource: params.topic });
  }

  const next = fetched.length === size ? fetched[fetched.length - 1].id + 1 : null;

  if (params.filter !== undefined) {
    const filtered = applyFilter(fetched, params.filter);
    if (!filtered.ok) return filtered;
    return ok({ entries: filtered.value, next });
  }

  return ok({ entries: fetched, next });
}

export function getEventsRoute(deps: GetEventsDeps): Route<null, GetEventsRequest, GetEventsResponse, RouteSuccess, RouteError> {
  return {
    parseRequest: mergeParser(pathParamParser(GetEventsPathSchema), queryParser(GetEventsQuerySchema)),
    handle: getEvents.bind(null, deps),
    parseResponse: responseParser(GetEventsResponseSchema),
  };
}
