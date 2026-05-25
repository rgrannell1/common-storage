// PUT /events/:topic/:id — upserts an event entry; creates at the given ID if absent, updates if present
// @work.md

import { z } from "zod";
import { ok, err, type Result } from "../../commons/types/result.ts";
import type { Route } from "../../commons/types/parser.ts";
import type { RouteError, RouteSuccess } from "../../commons/types/responses.ts";
import { pathParamParser, bodyParser, mergeAll, idempotencyKeyParser, tokenIdParser } from "../parsers/combinators.ts";
import { TopicNameSchema, EventEntrySchema, TimestampSchema, JsonPayloadSchema } from "../parsers/schemas.ts";
import type { IValidateTopicPayload } from "../parsers/payload-schema.ts";
import type { IUpdateEvent, IReadIdempotencyEntry, IWriteIdempotencyEntry, EventEntry } from "../../storage/capabilities.ts";
import { MAX_PAYLOAD_BYTES, IDEMPOTENCY_NS_PUT_EVENT } from "../../commons/constants.ts";

const PutEventPathSchema = z.object({
  topic: TopicNameSchema,
  id: z.coerce.number().int().positive(),
});

const PutEventBodySchema = z.object({
  payload: JsonPayloadSchema,
  createdAt: TimestampSchema.optional(),
  updatedAt: TimestampSchema.optional(),
});

type PutEventRequest = z.infer<typeof PutEventPathSchema> & z.infer<typeof PutEventBodySchema> & { idempotencyKey: string | undefined; tokenId: string };
type PutEventResult = { entry: EventEntry; created: boolean };

type PutEventDeps = {
  storage: IUpdateEvent & IReadIdempotencyEntry & IWriteIdempotencyEntry;
  schemas: IValidateTopicPayload;
};

async function putEvent(deps: PutEventDeps, params: PutEventRequest): Promise<Result<PutEventResult, RouteError>> {
  if (params.idempotencyKey !== undefined) {
    const cached = await deps.storage.readIdempotencyEntry(`${IDEMPOTENCY_NS_PUT_EVENT}:${params.tokenId}`, params.topic, params.idempotencyKey);
    if (cached !== null) {
      return ok(cached as PutEventResult);
    }
  }

  const schemaError = deps.schemas.validate(params.topic, params.payload);
  if (schemaError !== null) return err({ kind: "validation_error", message: schemaError });

  if ((JSON.stringify(params.payload) ?? "").length > MAX_PAYLOAD_BYTES) {
    return err({ kind: "validation_error", message: `Payload exceeds maximum size of ${MAX_PAYLOAD_BYTES} bytes` });
  }

  const result = await deps.storage.updateEvent(params.topic, params.id, params.payload, {
    createdAt: params.createdAt,
    updatedAt: params.updatedAt,
  });
  if (result === null) {
    return err({ kind: "not_found", resource: params.topic });
  }

  if (params.idempotencyKey !== undefined) {
    await deps.storage.writeIdempotencyEntry(`${IDEMPOTENCY_NS_PUT_EVENT}:${params.tokenId}`, params.topic, params.idempotencyKey, result);
  }

  return ok(result);
}

function putEventResponseParser(value: unknown): Result<RouteSuccess, RouteError> {
  const result = value as PutEventResult;
  const parsed = EventEntrySchema.safeParse(result.entry);
  if (!parsed.success) return err({ kind: "internal", message: parsed.error.message });
  return ok({ kind: result.created ? "created" : "ok", body: parsed.data });
}

export function putEventRoute(deps: PutEventDeps): Route<unknown, PutEventRequest, PutEventResult, RouteSuccess, RouteError> {
  return {
    parseRequest: mergeAll(pathParamParser(PutEventPathSchema), bodyParser(PutEventBodySchema), idempotencyKeyParser(), tokenIdParser()),
    handle: putEvent.bind(null, deps),
    parseResponse: putEventResponseParser,
  };
}
