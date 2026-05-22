// POST /diff/:topic — set reconciliation for event and object topics
// @work.md

import { z } from "zod";
import { ok, err, type Result } from "../../commons/types/result.ts";
import type { Route } from "../../commons/types/parser.ts";
import type { RouteError, RouteSuccess } from "../../commons/types/responses.ts";
import { pathParamParser, mergeParser, rawBodyParser } from "../parsers/combinators.ts";
import { TopicNameSchema, EventDiffBodySchema, ObjectDiffBodySchema } from "../parsers/schemas.ts";
import type { IGetTopicType, IDiffEvents, IDiffObjects, EventDiffRequest, ObjectDiffRequest } from "../storage/capabilities.ts";

const PostDiffPathSchema = z.object({
  topic: TopicNameSchema,
});

type PostDiffRequest = z.infer<typeof PostDiffPathSchema> & { body: unknown };

type PostDiffDeps = {
  storage: IGetTopicType & IDiffEvents & IDiffObjects;
};

type DiffResult =
  | { kind: "match" }
  | { kind: "event_diff"; ranges: { start: number; end: number }[] }
  | { kind: "object_diff"; ids: string[] };

// Validates the raw request body against the given schema; returns a validation_error on failure.
function parseDiffBody<BodyValue>(schema: z.ZodType<BodyValue>, rawBody: unknown): Result<BodyValue, RouteError> {
  const parsed = schema.safeParse(rawBody);
  if (!parsed.success) return err({ kind: "validation_error", message: parsed.error.message });
  return ok(parsed.data);
}

// Parses and runs an event-topic diff, returning the ranges where server and client diverge.
async function handleEventDiff(deps: PostDiffDeps, topic: string, rawBody: unknown): Promise<Result<DiffResult, RouteError>> {
  const body = parseDiffBody(EventDiffBodySchema, rawBody);
  if (!body.ok) return body;

  const result = await deps.storage.diffEvents(topic, body.value as EventDiffRequest);
  if (result === null) return err({ kind: "not_found", resource: topic });
  if (result.kind === "match") return ok({ kind: "match" });
  return ok({ kind: "event_diff", ranges: result.ranges });
}

// Parses and runs an object-topic diff, returning the IDs where server and client diverge.
async function handleObjectDiff(deps: PostDiffDeps, topic: string, rawBody: unknown): Promise<Result<DiffResult, RouteError>> {
  const body = parseDiffBody(ObjectDiffBodySchema, rawBody);
  if (!body.ok) return body;

  const result = await deps.storage.diffObjects(topic, body.value as ObjectDiffRequest);
  if (result === null) return err({ kind: "not_found", resource: topic });
  if (result.kind === "match") return ok({ kind: "match" });
  return ok({ kind: "object_diff", ids: result.ids });
}

// Dispatches to the correct diff handler based on the topic type.
async function postDiff(deps: PostDiffDeps, params: PostDiffRequest): Promise<Result<DiffResult, RouteError>> {
  const topicType = await deps.storage.getTopicType(params.topic);
  if (topicType === null) return err({ kind: "not_found", resource: params.topic });

  if (topicType === "event") return handleEventDiff(deps, params.topic, params.body);
  return handleObjectDiff(deps, params.topic, params.body);
}

// Translates a DiffResult into its HTTP response form: 204 on match, 200 with diff body otherwise.
function diffResponseParser(value: unknown): Result<RouteSuccess, RouteError> {
  const result = value as DiffResult;
  if (result.kind === "match") return ok({ kind: "no_content" });
  if (result.kind === "event_diff") return ok({ kind: "ok", body: { ranges: result.ranges } });
  return ok({ kind: "ok", body: { ids: result.ids } });
}

export function postDiffRoute(deps: PostDiffDeps): Route<unknown, PostDiffRequest, DiffResult, RouteSuccess, RouteError> {
  return {
    parseRequest: mergeParser(pathParamParser(PostDiffPathSchema), rawBodyParser),
    handle: postDiff.bind(null, deps),
    parseResponse: diffResponseParser,
  };
}
