// GET /events/:topic — returns a paginated list of entries from an event topic
// @work.md

import { z } from "zod";
import { ok, err, type Result } from "../../commons/types/result.ts";
import type { Route } from "../../commons/types/parser.ts";
import type { RouteError, RouteSuccess } from "../../commons/types/responses.ts";
import { pathParamParser, queryParser, mergeAll, acceptParser, abortSignalParser, responseParser } from "../parsers/combinators.ts";
import { TopicNameSchema, EventEntrySchema, QueryStartSchema, QuerySizeSchema, QueryIdsSchema, QueryFilterSchema } from "../parsers/schemas.ts";
import { applyFilter } from "../parsers/filter.ts";
import { DEFAULT_PAGE_SIZE } from "../../commons/constants.ts";
import type { IReadEvents, IStreamEvents, EventEntry } from "../storage/capabilities.ts";

const GetEventsPathSchema = z.object({
  topic: TopicNameSchema,
});

const GetEventsQuerySchema = z.object({
  start: QueryStartSchema.optional(),
  size: QuerySizeSchema.optional(),
  ids: QueryIdsSchema.optional(),
  filter: QueryFilterSchema.optional(),
});

type GetEventsRequest = z.infer<typeof GetEventsPathSchema> & z.infer<typeof GetEventsQuerySchema> & { stream: boolean; signal: AbortSignal };

type GetEventsDeps = {
  storage: IReadEvents & IStreamEvents;
};

const GetEventsResponseSchema = z.object({
  entries: z.array(EventEntrySchema),
  // ID to pass as ?start= on the next request; null when the topic is exhausted
  next: z.number().int().positive().nullable(),
});

type GetEventsPaginated = z.infer<typeof GetEventsResponseSchema>;
type GetEventsStream = { kind: "stream"; stream: ReadableStream<Uint8Array> };
type GetEventsResponse = GetEventsPaginated | GetEventsStream;

// Wraps an async generator of entries into a UTF-8 NDJSON ReadableStream.
function buildNdjsonStream(generator: AsyncGenerator<EventEntry>): ReadableStream<Uint8Array> {
  return ReadableStream.from(generator)
    .pipeThrough(new TransformStream<EventEntry, string>({
      transform(entry, controller) {
        controller.enqueue(JSON.stringify(entry) + "\n");
      },
    }))
    .pipeThrough(new TextEncoderStream());
}

function streamEventsResponse(deps: GetEventsDeps, params: GetEventsRequest): Result<GetEventsResponse, RouteError> {
  const startId = params.start ?? 1;
  const generator = deps.storage.streamEvents(params.topic, startId, params.signal);
  return ok({ kind: "stream", stream: buildNdjsonStream(generator) });
}

async function paginatedEventsResponse(deps: GetEventsDeps, params: GetEventsRequest): Promise<Result<GetEventsResponse, RouteError>> {
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

function getEvents(deps: GetEventsDeps, params: GetEventsRequest): Promise<Result<GetEventsResponse, RouteError>> {
  if (params.stream) return Promise.resolve(streamEventsResponse(deps, params));
  return paginatedEventsResponse(deps, params);
}

function eventsResponseParser(value: unknown): Result<RouteSuccess, RouteError> {
  if (value !== null && typeof value === "object" && "kind" in value && (value as GetEventsStream).kind === "stream") {
    return ok(value as RouteSuccess);
  }
  return responseParser(GetEventsResponseSchema)(value);
}

export function getEventsRoute(deps: GetEventsDeps): Route<null, GetEventsRequest, GetEventsResponse, RouteSuccess, RouteError> {
  return {
    parseRequest: mergeAll(
      pathParamParser(GetEventsPathSchema),
      queryParser(GetEventsQuerySchema),
      acceptParser("application/x-ndjson"),
      abortSignalParser(),
    ),
    handle: getEvents.bind(null, deps),
    parseResponse: eventsResponseParser,
  };
}
