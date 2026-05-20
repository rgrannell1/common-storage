// GET /objects/:topic — returns all entries from an object topic, including tombstones
// @design.md

import { z } from "zod";
import { ok, err, type Result } from "../../commons/types/result.ts";
import type { Route } from "../../commons/types/parser.ts";
import type { RouteError, RouteSuccess } from "../../commons/types/responses.ts";
import { pathParamParser, responseParser } from "../parsers/combinators.ts";
import { TopicNameSchema, ObjectEntrySchema } from "../parsers/schemas.ts";
import type { IReadObjects, ObjectEntry } from "../storage/capabilities.ts";

const GetObjectsPathSchema = z.object({
  topic: TopicNameSchema,
});

type GetObjectsRequest = z.infer<typeof GetObjectsPathSchema>;

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

  return ok(entries);
}

export function getObjectsRoute(deps: GetObjectsDeps): Route<null, GetObjectsRequest, GetObjectsResponse, RouteSuccess, RouteError> {
  return {
    parseRequest: pathParamParser(GetObjectsPathSchema),
    handle: getObjects.bind(null, deps),
    parseResponse: responseParser(GetObjectsResponseSchema),
  };
}
