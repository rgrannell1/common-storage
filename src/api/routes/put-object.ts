// PUT /objects/:topic/:id — upserts an entry in an object topic
// @work.md

import { z } from "zod";
import { ok, err, type Result } from "../../commons/types/result.ts";
import type { Route } from "../../commons/types/parser.ts";
import type { RouteError, RouteSuccess } from "../../commons/types/responses.ts";
import {
  pathParamParser,
  bodyParser,
  mergeAll,
  payloadParser,
  responseParser,
} from "../parsers/combinators.ts";
import { TopicNameSchema, ObjectEntrySchema, JsonPayloadSchema } from "../parsers/schemas.ts";
import type { IValidateTopicPayload } from "../parsers/payload-schema.ts";
import type { IUpsertObject, ObjectEntry } from "../../storage/capabilities.ts";
import { writeFailureToError } from "./write-result.ts";

const PutObjectPathSchema = z.object({
  topic: TopicNameSchema,
  id: z.string().min(1),
});

const PutObjectBodySchema = z.object({
  payload: JsonPayloadSchema,
});

type PutObjectRequest = z.infer<typeof PutObjectPathSchema> & z.infer<typeof PutObjectBodySchema>;

type PutObjectDeps = {
  storage: IUpsertObject;
  schemas: IValidateTopicPayload;
};

async function putObject(
  deps: PutObjectDeps,
  params: PutObjectRequest,
): Promise<Result<ObjectEntry, RouteError>> {
  const result = await deps.storage.upsertObject(params.topic, params.id, params.payload);
  if (!result.ok) return err(writeFailureToError(result.error, params.topic));
  return ok(result.value);
}

export function putObjectRoute(
  deps: PutObjectDeps,
): Route<unknown, PutObjectRequest, ObjectEntry, RouteSuccess, RouteError> {
  return {
    parseRequest: mergeAll(
      pathParamParser(PutObjectPathSchema),
      bodyParser(PutObjectBodySchema),
      payloadParser(deps.schemas),
    ),
    handle: putObject.bind(null, deps),
    parseResponse: responseParser(ObjectEntrySchema),
  };
}
