// PUT /events/:topic/:id — upserts an event entry; creates at the given ID if
// absent, updates if present
// @work.md

import { z } from "zod";
import { ok, err, type Result } from "../../commons/types/result.ts";
import type { Route } from "../../commons/types/parser.ts";
import type { RouteError, RouteSuccess } from "../../commons/types/responses.ts";
import { pathParamParser, bodyParser, mergeAll, payloadParser } from "../parsers/combinators.ts";
import {
  TopicNameSchema,
  EventEntrySchema,
  TimestampSchema,
  JsonPayloadSchema,
} from "../parsers/schemas.ts";
import type { IValidateTopicPayload } from "../parsers/payload-schema.ts";
import type { IUpdateEvent, EventEntry } from "../../storage/capabilities.ts";
import { writeFailureToError } from "./write-result.ts";

const PutEventPathSchema = z.object({
  topic: TopicNameSchema,
  id: z.coerce.number().int().positive(),
});

const PutEventBodySchema = z.object({
  payload: JsonPayloadSchema,
  createdAt: TimestampSchema.optional(),
  updatedAt: TimestampSchema.optional(),
});

type PutEventRequest = z.infer<typeof PutEventPathSchema> & z.infer<typeof PutEventBodySchema>;
type PutEventResult = { entry: EventEntry; created: boolean };

type PutEventDeps = {
  storage: IUpdateEvent;
  schemas: IValidateTopicPayload;
};

async function putEvent(
  deps: PutEventDeps,
  params: PutEventRequest,
): Promise<Result<PutEventResult, RouteError>> {
  const result = await deps.storage.updateEvent(params.topic, params.id, params.payload, {
    createdAt: params.createdAt,
    updatedAt: params.updatedAt,
  });
  if (!result.ok) return err(writeFailureToError(result.error, params.topic));
  return ok(result.value);
}

function putEventResponseParser(value: unknown): Result<RouteSuccess, RouteError> {
  const result = value as PutEventResult;
  const parsed = EventEntrySchema.safeParse(result.entry);
  if (!parsed.success) return err({ kind: "internal", message: parsed.error.message });
  return ok({ kind: result.created ? "created" : "ok", body: parsed.data });
}

export function putEventRoute(
  deps: PutEventDeps,
): Route<unknown, PutEventRequest, PutEventResult, RouteSuccess, RouteError> {
  return {
    parseRequest: mergeAll(
      pathParamParser(PutEventPathSchema),
      bodyParser(PutEventBodySchema),
      payloadParser(deps.schemas),
    ),
    handle: putEvent.bind(null, deps),
    parseResponse: putEventResponseParser,
  };
}
