// POST /events/:topic — writes a new entry to an event topic
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
import { TopicNameSchema, EventEntrySchema, JsonPayloadSchema } from "../parsers/schemas.ts";
import type { IValidateTopicPayload } from "../parsers/payload-schema.ts";
import type { IWriteEvent, EventEntry } from "../../storage/capabilities.ts";
import { writeFailureToError } from "./write-result.ts";

const PostEventPathSchema = z.object({
  topic: TopicNameSchema,
});

const PostEventBodySchema = z.object({
  payload: JsonPayloadSchema,
});

type PostEventRequest = z.infer<typeof PostEventPathSchema> & z.infer<typeof PostEventBodySchema>;

type PostEventDeps = {
  storage: IWriteEvent;
  schemas: IValidateTopicPayload;
};

async function postEvent(
  deps: PostEventDeps,
  params: PostEventRequest,
): Promise<Result<EventEntry, RouteError>> {
  const result = await deps.storage.writeEvent(params.topic, params.payload);
  if (!result.ok) return err(writeFailureToError(result.error, params.topic));
  return ok(result.value);
}

export function postEventRoute(
  deps: PostEventDeps,
): Route<unknown, PostEventRequest, EventEntry, RouteSuccess, RouteError> {
  return {
    parseRequest: mergeAll(
      pathParamParser(PostEventPathSchema),
      bodyParser(PostEventBodySchema),
      payloadParser(deps.schemas),
    ),
    handle: postEvent.bind(null, deps),
    parseResponse: responseParser(EventEntrySchema, "created"),
  };
}
