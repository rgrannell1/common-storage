// GET /content/:topic — returns a paginated list of entries from an event topic
// @design.md

import { z } from "zod";
import { ok, err, type Result } from "../../commons/types/result.ts";
import type { Route } from "../../commons/types/parser.ts";
import type { RouteError, RouteSuccess } from "../../commons/types/responses.ts";
import { pathParamParser, queryParser, mergeParser, responseParser } from "../parsers/combinators.ts";
import { TopicNameSchema, ContentEntrySchema, QueryStartSchema, QuerySizeSchema } from "../parsers/schemas.ts";
import { DEFAULT_PAGE_SIZE } from "../../commons/constants.ts";
import type { IReadContent, ContentEntry } from "../storage/capabilities.ts";

const GetContentPathSchema = z.object({
  topic: TopicNameSchema,
});

const GetContentQuerySchema = z.object({
  start: QueryStartSchema.optional(),
  size: QuerySizeSchema.optional(),
});

type GetContentRequest = z.infer<typeof GetContentPathSchema> & z.infer<typeof GetContentQuerySchema>;

type GetContentDeps = {
  storage: IReadContent;
};

const GetContentResponseSchema = z.array(ContentEntrySchema);

type GetContentResponse = z.infer<typeof GetContentResponseSchema>;

async function getContent(deps: GetContentDeps, params: GetContentRequest): Promise<Result<GetContentResponse, RouteError>> {
  const entries = await deps.storage.readContent(params.topic, {
    start: params.start,
    size: params.size ?? DEFAULT_PAGE_SIZE,
  });

  if (entries === null) {
    return err({ kind: "not_found", resource: params.topic });
  }

  return ok(entries);
}

export function getContentRoute(deps: GetContentDeps): Route<null, GetContentRequest, GetContentResponse, RouteSuccess, RouteError> {
  return {
    parseRequest: mergeParser(pathParamParser(GetContentPathSchema), queryParser(GetContentQuerySchema)),
    handle: getContent.bind(null, deps),
    parseResponse: responseParser(GetContentResponseSchema),
  };
}
