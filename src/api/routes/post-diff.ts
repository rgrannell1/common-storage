// POST /diff/:topic — interactive Merkle tree reconciliation for event and object topics
// @work.md

import { z } from "zod";
import { ok, err, type Result } from "../../commons/types/result.ts";
import type { Route } from "../../commons/types/parser.ts";
import type { RouteError, RouteSuccess } from "../../commons/types/responses.ts";
import { pathParamParser, mergeParser, rawBodyParser } from "../parsers/combinators.ts";
import { TopicNameSchema, MerkleDiffBodySchema } from "../parsers/schemas.ts";
import type { IGetTopicType, IDiffEvents, IDiffObjects, MerkleDiffRequest, MerkleDiffResponse } from "../../storage/capabilities.ts";

const PostDiffPathSchema = z.object({
  topic: TopicNameSchema,
});

type PostDiffRequest = z.infer<typeof PostDiffPathSchema> & { body: unknown };

type PostDiffDeps = {
  storage: IGetTopicType & IDiffEvents & IDiffObjects;
};

// Validates the request body and dispatches to the correct diff function.
async function handleDiff(
  topic: string,
  rawBody: unknown,
  diffFn: (req: MerkleDiffRequest) => Promise<MerkleDiffResponse | null>,
): Promise<Result<MerkleDiffResponse, RouteError>> {
  const parsed = MerkleDiffBodySchema.safeParse(rawBody);
  if (!parsed.success) return err({ kind: "validation_error", message: parsed.error.message });

  const result = await diffFn(parsed.data);
  if (result === null) return err({ kind: "not_found", resource: topic });
  return ok(result);
}

// Dispatches to the correct diff function based on the topic type.
async function postDiff(deps: PostDiffDeps, params: PostDiffRequest): Promise<Result<MerkleDiffResponse, RouteError>> {
  const topicType = await deps.storage.getTopicType(params.topic);
  if (topicType === null) return err({ kind: "not_found", resource: params.topic });

  const diffFn = topicType === "event"
    ? (req: MerkleDiffRequest) => deps.storage.diffEvents(params.topic, req)
    : (req: MerkleDiffRequest) => deps.storage.diffObjects(params.topic, req);

  return handleDiff(params.topic, params.body, diffFn);
}

// Translates a MerkleDiffResponse into its HTTP response form: 204 on match, 200 with mismatches otherwise.
function diffResponseParser(value: unknown): Result<RouteSuccess, RouteError> {
  const result = value as MerkleDiffResponse;
  if (result.kind === "match") return ok({ kind: "no_content" });
  return ok({ kind: "ok", body: { mismatches: result.mismatches } });
}

export function postDiffRoute(deps: PostDiffDeps): Route<unknown, PostDiffRequest, MerkleDiffResponse, RouteSuccess, RouteError> {
  return {
    parseRequest: mergeParser(pathParamParser(PostDiffPathSchema), rawBodyParser),
    handle: postDiff.bind(null, deps),
    parseResponse: diffResponseParser,
  };
}
