// GET /objects/:topic — returns all entries from an object topic, including tombstones
// @work.md

import { z } from "zod";
import { ok, err, type Result } from "../../commons/types/result.ts";
import type { Route } from "../../commons/types/parser.ts";
import type { RouteError, RouteSuccess } from "../../commons/types/responses.ts";
import { pathParamParser, queryParser, mergeParser, responseParser } from "../parsers/combinators.ts";
import { TopicNameSchema, ObjectEntrySchema, QueryFilterSchema } from "../parsers/schemas.ts";
import { applyFilter } from "../parsers/filter.ts";
import type { IReadObjects } from "../storage/capabilities.ts";

const GetObjectsPathSchema = z.object({
  topic: TopicNameSchema,
});

const GetObjectsQuerySchema = z.object({
  filter: QueryFilterSchema.optional(),
});

type GetObjectsRequest = z.infer<typeof GetObjectsPathSchema> & z.infer<typeof GetObjectsQuerySchema>;

type GetObjectsDeps = {
  storage: IReadObjects;
};

const GetObjectsResponseSchema = z.array(ObjectEntrySchema);

type GetObjectsResponse = z.infer<typeof GetObjectsResponseSchema>;

async function getObjects(deps: GetObjectsDeps, params: GetObjectsRequest): Promise<Result<GetObjectsResponse, RouteError>> {
  const entries = await deps.storage.readObjects(params.topic);

  if (entries === null) {
    return err({ kind: "not_found", resource: params.topic });
  }

  if (params.filter !== undefined) {
    return applyFilter(entries, params.filter);
  }

  return ok(entries);
}

export function getObjectsRoute(deps: GetObjectsDeps): Route<null, GetObjectsRequest, GetObjectsResponse, RouteSuccess, RouteError> {
  return {
    parseRequest: mergeParser(pathParamParser(GetObjectsPathSchema), queryParser(GetObjectsQuerySchema)),
    handle: getObjects.bind(null, deps),
    parseResponse: responseParser(GetObjectsResponseSchema),
  };
}
