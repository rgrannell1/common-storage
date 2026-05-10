// POST /content/:topic — writes a new entry to an event topic
// @design.md

import { z } from "zod";
import { ok, err, type Result } from "../../commons/types/result.ts";
import type { Route } from "../../commons/types/parser.ts";
import type { RouteError, RouteSuccess } from "../../commons/types/responses.ts";
import { pathParamParser, bodyParser, mergeParser, responseParser } from "../parsers/combinators.ts";
import { TopicNameSchema, ContentEntrySchema } from "../parsers/schemas.ts";
import type { IWriteContent, ContentEntry } from "../storage/capabilities.ts";

const PostContentPathSchema = z.object({
  topic: TopicNameSchema,
});

const PostContentBodySchema = z.object({
  payload: z.unknown(),
});

type PostContentRequest = z.infer<typeof PostContentPathSchema> & z.infer<typeof PostContentBodySchema>;

type PostContentDeps = {
  storage: IWriteContent;
};

async function postContent(deps: PostContentDeps, params: PostContentRequest): Promise<Result<ContentEntry, RouteError>> {
  const entry = await deps.storage.writeContent(params.topic, params.payload);
  if (entry === null) {
    return err({ kind: "not_found", resource: params.topic });
  }
  return ok(entry);
}

export function postContentRoute(deps: PostContentDeps): Route<unknown, PostContentRequest, ContentEntry, RouteSuccess, RouteError> {
  return {
    parseRequest: mergeParser(pathParamParser(PostContentPathSchema), bodyParser(PostContentBodySchema)),
    handle: postContent.bind(null, deps),
    parseResponse: responseParser(ContentEntrySchema, "created"),
  };
}
