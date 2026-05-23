// GET /objects/:topic — paginated by seq, filtered, or NDJSON-streamed
// @work.md

import { z } from "zod";
import { ok, err, type Result } from "../../commons/types/result.ts";
import type { Route } from "../../commons/types/parser.ts";
import type { RouteError, RouteSuccess } from "../../commons/types/responses.ts";
import { pathParamParser, queryParser, mergeAll, acceptParser, abortSignalParser, responseParser } from "../parsers/combinators.ts";
import { TopicNameSchema, ObjectEntrySchema, QueryStartSchema, QuerySizeSchema, QueryFilterSchema } from "../parsers/schemas.ts";
import { applyFilter } from "../parsers/filter.ts";
import type { IReadObjects, IReadObjectsBySeq, IStreamObjects, ObjectEntry } from "../storage/capabilities.ts";

const GetObjectsPathSchema = z.object({
  topic: TopicNameSchema,
});

const GetObjectsQuerySchema = z.object({
  start: QueryStartSchema.optional(),
  size: QuerySizeSchema.optional(),
  filter: QueryFilterSchema.optional(),
});

type GetObjectsRequest = z.infer<typeof GetObjectsPathSchema> & z.infer<typeof GetObjectsQuerySchema> & { stream: boolean; signal: AbortSignal };

type GetObjectsDeps = {
  storage: IReadObjects & IReadObjectsBySeq & IStreamObjects;
};

const GetObjectsPageSchema = z.object({
  entries: z.array(ObjectEntrySchema),
  next: z.number().int().positive().nullable(),
});

type GetObjectsPaginated = z.infer<typeof GetObjectsPageSchema>;
type GetObjectsStream = { kind: "stream"; stream: ReadableStream<Uint8Array> };
type GetObjectsResponse = ObjectEntry[] | GetObjectsPaginated | GetObjectsStream;

// Wraps an async generator of object entries into a UTF-8 NDJSON ReadableStream.
function buildNdjsonStream(generator: AsyncGenerator<ObjectEntry>): ReadableStream<Uint8Array> {
  return ReadableStream.from(generator)
    .pipeThrough(new TransformStream<ObjectEntry, string>({
      transform(entry, controller) {
        controller.enqueue(JSON.stringify(entry) + "\n");
      },
    }))
    .pipeThrough(new TextEncoderStream());
}

function streamObjectsResponse(deps: GetObjectsDeps, params: GetObjectsRequest): Result<GetObjectsResponse, RouteError> {
  const startSeq = params.start ?? 1;
  const generator = deps.storage.streamObjects(params.topic, startSeq, params.signal);
  return ok({ kind: "stream", stream: buildNdjsonStream(generator) });
}

async function seqPaginatedResponse(deps: GetObjectsDeps, params: GetObjectsRequest): Promise<Result<GetObjectsResponse, RouteError>> {
  const size = params.size ?? 100;
  const fetched = await deps.storage.readObjectsBySeq(params.topic, { start: params.start, size });

  if (fetched === null) return err({ kind: "not_found", resource: params.topic });

  const next = fetched.length === size ? fetched[fetched.length - 1].seq + 1 : null;

  if (params.filter !== undefined) {
    const filtered = applyFilter(fetched, params.filter);
    if (!filtered.ok) return filtered;
    return ok({ entries: filtered.value, next });
  }

  return ok({ entries: fetched, next });
}

async function allObjectsResponse(deps: GetObjectsDeps, params: GetObjectsRequest): Promise<Result<GetObjectsResponse, RouteError>> {
  const entries = await deps.storage.readObjects(params.topic);

  if (entries === null) return err({ kind: "not_found", resource: params.topic });

  if (params.filter !== undefined) {
    return applyFilter(entries, params.filter);
  }

  return ok(entries);
}

function getObjects(deps: GetObjectsDeps, params: GetObjectsRequest): Promise<Result<GetObjectsResponse, RouteError>> {
  if (params.stream) return Promise.resolve(streamObjectsResponse(deps, params));
  if (params.start !== undefined || params.size !== undefined) return seqPaginatedResponse(deps, params);
  return allObjectsResponse(deps, params);
}

function objectsResponseParser(value: unknown): Result<RouteSuccess, RouteError> {
  if (value !== null && typeof value === "object" && "kind" in value && (value as GetObjectsStream).kind === "stream") {
    return ok(value as RouteSuccess);
  }
  // All-objects response (plain array) — checked before paginated to avoid Array.prototype.entries false-positive
  if (Array.isArray(value)) {
    return responseParser(z.array(ObjectEntrySchema))(value);
  }
  // Paginated response (has entries + next)
  if (value !== null && typeof value === "object" && "entries" in value) {
    return responseParser(GetObjectsPageSchema)(value);
  }
  return err({ kind: "internal", message: "Unexpected response shape from getObjects" });
}

export function getObjectsRoute(deps: GetObjectsDeps): Route<null, GetObjectsRequest, GetObjectsResponse, RouteSuccess, RouteError> {
  return {
    parseRequest: mergeAll(
      pathParamParser(GetObjectsPathSchema),
      queryParser(GetObjectsQuerySchema),
      acceptParser("application/x-ndjson"),
      abortSignalParser(),
    ),
    handle: getObjects.bind(null, deps),
    parseResponse: objectsResponseParser,
  };
}
