// PUT /objects/:topic/:id — upserts an entry in an object topic
// @design.md

import { z } from "zod";
import { ok, err, type Result } from "../../commons/types/result.ts";
import type { Route } from "../../commons/types/parser.ts";
import type { RouteError, RouteSuccess } from "../../commons/types/responses.ts";
import { pathParamParser, bodyParser, mergeParser, responseParser } from "../parsers/combinators.ts";
import { TopicNameSchema, ObjectEntrySchema } from "../parsers/schemas.ts";
import type { IUpsertObject, ObjectEntry } from "../storage/capabilities.ts";

const PutObjectPathSchema = z.object({
  topic: TopicNameSchema,
  id: z.string().min(1),
});

const PutObjectBodySchema = z.object({
  payload: z.unknown(),
});

type PutObjectRequest = z.infer<typeof PutObjectPathSchema> & z.infer<typeof PutObjectBodySchema>;

type PutObjectDeps = {
  storage: IUpsertObject;
};

async function putObject(deps: PutObjectDeps, params: PutObjectRequest): Promise<Result<ObjectEntry, RouteError>> {
  const entry = await deps.storage.upsertObject(params.topic, params.id, params.payload);

  if (entry === null) {
    return err({ kind: "not_found", resource: params.topic });
  }

  return ok(entry);
}

export function putObjectRoute(deps: PutObjectDeps): Route<unknown, PutObjectRequest, ObjectEntry, RouteSuccess, RouteError> {
  return {
    parseRequest: mergeParser(pathParamParser(PutObjectPathSchema), bodyParser(PutObjectBodySchema)),
    handle: putObject.bind(null, deps),
    parseResponse: responseParser(ObjectEntrySchema),
  };
}
