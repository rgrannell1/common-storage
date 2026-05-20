// DELETE /objects/:topic/:id — writes a tombstone to an object topic entry
// @work.md

import { z } from "zod";
import { ok, err, type Result } from "../../commons/types/result.ts";
import type { Route } from "../../commons/types/parser.ts";
import type { RouteError, RouteSuccess } from "../../commons/types/responses.ts";
import { pathParamParser, responseParser } from "../parsers/combinators.ts";
import { TopicNameSchema, ObjectEntrySchema } from "../parsers/schemas.ts";
import type { IDeleteObject, ObjectEntry } from "../storage/capabilities.ts";

const DeleteObjectPathSchema = z.object({
  topic: TopicNameSchema,
  id: z.string().min(1),
});

type DeleteObjectRequest = z.infer<typeof DeleteObjectPathSchema>;

type DeleteObjectDeps = {
  storage: IDeleteObject;
};

async function deleteObject(deps: DeleteObjectDeps, params: DeleteObjectRequest): Promise<Result<ObjectEntry, RouteError>> {
  const tombstone = await deps.storage.deleteObject(params.topic, params.id);

  if (tombstone === null) {
    return err({ kind: "not_found", resource: params.topic });
  }

  return ok(tombstone);
}

export function deleteObjectRoute(deps: DeleteObjectDeps): Route<null, DeleteObjectRequest, ObjectEntry, RouteSuccess, RouteError> {
  return {
    parseRequest: pathParamParser(DeleteObjectPathSchema),
    handle: deleteObject.bind(null, deps),
    parseResponse: responseParser(ObjectEntrySchema),
  };
}
