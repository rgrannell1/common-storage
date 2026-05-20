// PUT /objects/:topic/:id — upserts an entry in an object topic
// @work.md

import { z } from "zod";
import { ok, err, type Result } from "../../commons/types/result.ts";
import type { Route } from "../../commons/types/parser.ts";
import type { RouteError, RouteSuccess } from "../../commons/types/responses.ts";
import { pathParamParser, bodyParser, mergeAll, idempotencyKeyParser, responseParser } from "../parsers/combinators.ts";
import { TopicNameSchema, ObjectEntrySchema } from "../parsers/schemas.ts";
import type { IUpsertObject, IReadIdempotencyEntry, IWriteIdempotencyEntry, ObjectEntry } from "../storage/capabilities.ts";

const PutObjectPathSchema = z.object({
  topic: TopicNameSchema,
  id: z.string().min(1),
});

const PutObjectBodySchema = z.object({
  payload: z.unknown(),
});

type PutObjectRequest = z.infer<typeof PutObjectPathSchema> & z.infer<typeof PutObjectBodySchema> & { idempotencyKey: string | undefined };

type PutObjectDeps = {
  storage: IUpsertObject & IReadIdempotencyEntry & IWriteIdempotencyEntry;
};

async function putObject(deps: PutObjectDeps, params: PutObjectRequest): Promise<Result<ObjectEntry, RouteError>> {
  if (params.idempotencyKey !== undefined) {
    const cached = await deps.storage.readIdempotencyEntry(params.topic, params.idempotencyKey);
    if (cached !== null) {
      return ok(cached as ObjectEntry);
    }
  }

  const entry = await deps.storage.upsertObject(params.topic, params.id, params.payload);
  if (entry === null) {
    return err({ kind: "not_found", resource: params.topic });
  }

  if (params.idempotencyKey !== undefined) {
    await deps.storage.writeIdempotencyEntry(params.topic, params.idempotencyKey, entry);
  }

  return ok(entry);
}

export function putObjectRoute(deps: PutObjectDeps): Route<unknown, PutObjectRequest, ObjectEntry, RouteSuccess, RouteError> {
  return {
    parseRequest: mergeAll(pathParamParser(PutObjectPathSchema), bodyParser(PutObjectBodySchema), idempotencyKeyParser()),
    handle: putObject.bind(null, deps),
    parseResponse: responseParser(ObjectEntrySchema),
  };
}
