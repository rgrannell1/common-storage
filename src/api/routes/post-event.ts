// POST /events/:topic — writes a new entry to an event topic
// @work.md

import { z } from "zod";
import { ok, err, type Result } from "../../commons/types/result.ts";
import type { Route } from "../../commons/types/parser.ts";
import type { RouteError, RouteSuccess } from "../../commons/types/responses.ts";
import { pathParamParser, bodyParser, mergeAll, idempotencyKeyParser, tokenIdParser, responseParser } from "../parsers/combinators.ts";
import { TopicNameSchema, EventEntrySchema, JsonPayloadSchema } from "../parsers/schemas.ts";
import type { IValidateTopicPayload } from "../parsers/payload-schema.ts";
import type { IWriteEvent, IReadIdempotencyEntry, IWriteIdempotencyEntry, EventEntry } from "../storage/capabilities.ts";
import { MAX_PAYLOAD_BYTES, IDEMPOTENCY_NS_POST_EVENT } from "../../commons/constants.ts";

const PostEventPathSchema = z.object({
  topic: TopicNameSchema,
});

const PostEventBodySchema = z.object({
  payload: JsonPayloadSchema,
});

type PostEventRequest = z.infer<typeof PostEventPathSchema> & z.infer<typeof PostEventBodySchema> & { idempotencyKey: string | undefined; tokenId: string };

type PostEventDeps = {
  storage: IWriteEvent & IReadIdempotencyEntry & IWriteIdempotencyEntry;
  schemas: IValidateTopicPayload;
};

async function postEvent(deps: PostEventDeps, params: PostEventRequest): Promise<Result<EventEntry, RouteError>> {
  if (params.idempotencyKey !== undefined) {
    const cached = await deps.storage.readIdempotencyEntry(`${IDEMPOTENCY_NS_POST_EVENT}:${params.tokenId}`, params.topic, params.idempotencyKey);
    if (cached !== null) {
      return ok(cached as EventEntry);
    }
  }

  const schemaError = deps.schemas.validate(params.topic, params.payload);
  if (schemaError !== null) return err({ kind: "validation_error", message: schemaError });

  if ((JSON.stringify(params.payload) ?? "").length > MAX_PAYLOAD_BYTES) {
    return err({ kind: "validation_error", message: `Payload exceeds maximum size of ${MAX_PAYLOAD_BYTES} bytes` });
  }

  const entry = await deps.storage.writeEvent(params.topic, params.payload);
  if (entry === null) {
    return err({ kind: "not_found", resource: params.topic });
  }

  if (params.idempotencyKey !== undefined) {
    await deps.storage.writeIdempotencyEntry(`${IDEMPOTENCY_NS_POST_EVENT}:${params.tokenId}`, params.topic, params.idempotencyKey, entry);
  }

  return ok(entry);
}

export function postEventRoute(deps: PostEventDeps): Route<unknown, PostEventRequest, EventEntry, RouteSuccess, RouteError> {
  return {
    parseRequest: mergeAll(pathParamParser(PostEventPathSchema), bodyParser(PostEventBodySchema), idempotencyKeyParser(), tokenIdParser()),
    handle: postEvent.bind(null, deps),
    parseResponse: responseParser(EventEntrySchema, "created"),
  };
}
