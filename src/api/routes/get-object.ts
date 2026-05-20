// GET /objects/:topic/:id — returns a single entry from an object topic
// @work.md

import { z } from "zod";
import { ok, err, type Result } from "../../commons/types/result.ts";
import type { Route } from "../../commons/types/parser.ts";
import type { RouteError, RouteSuccess } from "../../commons/types/responses.ts";
import { pathParamParser, responseParser } from "../parsers/combinators.ts";
import { TopicNameSchema, ObjectEntrySchema } from "../parsers/schemas.ts";
import type { IReadObject, ObjectEntry } from "../storage/capabilities.ts";

const GetObjectPathSchema = z.object({
  topic: TopicNameSchema,
  id: z.string().min(1),
});

type GetObjectRequest = z.infer<typeof GetObjectPathSchema>;

type GetObjectDeps = {
  storage: IReadObject;
};

async function getObject(deps: GetObjectDeps, params: GetObjectRequest): Promise<Result<ObjectEntry, RouteError>> {
  const entry = await deps.storage.readObject(params.topic, params.id);

  if (entry === null) {
    return err({ kind: "not_found", resource: `${params.topic}/${params.id}` });
  }

  return ok(entry);
}

export function getObjectRoute(deps: GetObjectDeps): Route<null, GetObjectRequest, ObjectEntry, RouteSuccess, RouteError> {
  return {
    parseRequest: pathParamParser(GetObjectPathSchema),
    handle: getObject.bind(null, deps),
    parseResponse: responseParser(ObjectEntrySchema),
  };
}
