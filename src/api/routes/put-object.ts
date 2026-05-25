// PUT /objects/:topic/:id — upserts an entry in an object topic
// @work.md

import { z } from "zod";
import { ok, err, type Result } from "../../commons/types/result.ts";
import type { Route } from "../../commons/types/parser.ts";
import type { RouteError, RouteSuccess } from "../../commons/types/responses.ts";
import { pathParamParser, bodyParser, mergeAll, idempotencyKeyParser, tokenIdParser, responseParser } from "../parsers/combinators.ts";
import { TopicNameSchema, ObjectEntrySchema, JsonPayloadSchema } from "../parsers/schemas.ts";
import type { IValidateTopicPayload } from "../parsers/payload-schema.ts";
import type { IUpsertObject, IReadIdempotencyEntry, IWriteIdempotencyEntry, ObjectEntry } from "../../storage/capabilities.ts";
import { MAX_PAYLOAD_BYTES, IDEMPOTENCY_NS_PUT_OBJECT } from "../../commons/constants.ts";

const PutObjectPathSchema = z.object({
  topic: TopicNameSchema,
  id: z.string().min(1),
});

const PutObjectBodySchema = z.object({
  payload: JsonPayloadSchema,
});

type PutObjectRequest = z.infer<typeof PutObjectPathSchema> & z.infer<typeof PutObjectBodySchema> & { idempotencyKey: string | undefined; tokenId: string };

type PutObjectDeps = {
  storage: IUpsertObject & IReadIdempotencyEntry & IWriteIdempotencyEntry;
  schemas: IValidateTopicPayload;
};

async function putObject(deps: PutObjectDeps, params: PutObjectRequest): Promise<Result<ObjectEntry, RouteError>> {
  if (params.idempotencyKey !== undefined) {
    const cached = await deps.storage.readIdempotencyEntry(`${IDEMPOTENCY_NS_PUT_OBJECT}:${params.tokenId}`, params.topic, params.idempotencyKey);
    if (cached !== null) {
      return ok(cached as ObjectEntry);
    }
  }

  const schemaError = deps.schemas.validate(params.topic, params.payload);
  if (schemaError !== null) return err({ kind: "validation_error", message: schemaError });

  if ((JSON.stringify(params.payload) ?? "").length > MAX_PAYLOAD_BYTES) {
    return err({ kind: "validation_error", message: `Payload exceeds maximum size of ${MAX_PAYLOAD_BYTES} bytes` });
  }

  const entry = await deps.storage.upsertObject(params.topic, params.id, params.payload);
  if (entry === null) {
    return err({ kind: "not_found", resource: params.topic });
  }

  if (params.idempotencyKey !== undefined) {
    await deps.storage.writeIdempotencyEntry(`${IDEMPOTENCY_NS_PUT_OBJECT}:${params.tokenId}`, params.topic, params.idempotencyKey, entry);
  }

  return ok(entry);
}

export function putObjectRoute(deps: PutObjectDeps): Route<unknown, PutObjectRequest, ObjectEntry, RouteSuccess, RouteError> {
  return {
    parseRequest: mergeAll(pathParamParser(PutObjectPathSchema), bodyParser(PutObjectBodySchema), idempotencyKeyParser(), tokenIdParser()),
    handle: putObject.bind(null, deps),
    parseResponse: responseParser(ObjectEntrySchema),
  };
}
