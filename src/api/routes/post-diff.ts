// POST /diff/:topic — set reconciliation for event and object topics
// @work.md

import { z } from "zod";
import { ok, err, type Result } from "../../commons/types/result.ts";
import type { Route } from "../../commons/types/parser.ts";
import type { RouteError, RouteSuccess } from "../../commons/types/responses.ts";
import { pathParamParser, mergeParser, rawBodyParser } from "../parsers/combinators.ts";
import { TopicNameSchema, EventDiffBodySchema } from "../parsers/schemas.ts";
import type { IGetTopicType, IDiffEvents, IDiffObjects, EventDiffRequest } from "../storage/capabilities.ts";

const PostDiffPathSchema = z.object({
  topic: TopicNameSchema,
});

type PostDiffRequest = z.infer<typeof PostDiffPathSchema> & { body: unknown };

type PostDiffDeps = {
  storage: IGetTopicType & IDiffEvents & IDiffObjects;
};

type DiffResult =
  | { kind: "match" }
  | { kind: "diff"; ranges: { start: number; end: number }[] };

// Validates the raw request body against the given schema; returns a validation_error on failure.
function parseDiffBody<BodyValue>(schema: z.ZodType<BodyValue>, rawBody: unknown): Result<BodyValue, RouteError> {
  const parsed = schema.safeParse(rawBody);
  if (!parsed.success) return err({ kind: "validation_error", message: parsed.error.message });
  return ok(parsed.data);
}

// Parses and runs a diff for either topic type; both return differing seq/id ranges.
async function handleDiff(topic: string, rawBody: unknown, diffFn: (req: EventDiffRequest) => Promise<{ kind: "match" } | { kind: "diff"; ranges: { start: number; end: number }[] } | null>): Promise<Result<DiffResult, RouteError>> {
  const body = parseDiffBody(EventDiffBodySchema, rawBody);
  if (!body.ok) return body;

  const result = await diffFn(body.value as EventDiffRequest);
  if (result === null) return err({ kind: "not_found", resource: topic });
  if (result.kind === "match") return ok({ kind: "match" });
  return ok({ kind: "diff", ranges: result.ranges });
}

// Dispatches to the correct diff function based on the topic type.
async function postDiff(deps: PostDiffDeps, params: PostDiffRequest): Promise<Result<DiffResult, RouteError>> {
  const topicType = await deps.storage.getTopicType(params.topic);
  if (topicType === null) return err({ kind: "not_found", resource: params.topic });

  const diffFn = topicType === "event"
    ? (req: EventDiffRequest) => deps.storage.diffEvents(params.topic, req)
    : (req: EventDiffRequest) => deps.storage.diffObjects(params.topic, req);

  return handleDiff(params.topic, params.body, diffFn);
}

// Translates a DiffResult into its HTTP response form: 204 on match, 200 with ranges otherwise.
function diffResponseParser(value: unknown): Result<RouteSuccess, RouteError> {
  const result = value as DiffResult;
  if (result.kind === "match") return ok({ kind: "no_content" });
  return ok({ kind: "ok", body: { ranges: result.ranges } });
}

export function postDiffRoute(deps: PostDiffDeps): Route<unknown, PostDiffRequest, DiffResult, RouteSuccess, RouteError> {
  return {
    parseRequest: mergeParser(pathParamParser(PostDiffPathSchema), rawBodyParser),
    handle: postDiff.bind(null, deps),
    parseResponse: diffResponseParser,
  };
}
