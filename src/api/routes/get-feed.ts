// GET /feed — returns a JSON summary of server state
// @design.md

import { z } from "zod";
import { err, type Result } from "../../commons/types/result.ts";
import type { Route } from "../../commons/types/parser.ts";
import type { RouteError, RouteSuccess } from "../../commons/types/responses.ts";
import { queryParser, responseParser } from "../parsers/combinators.ts";
import { HumanFlagSchema, TopicSummarySchema, SubscriptionSummarySchema } from "../parsers/schemas.ts";
import type { IGetSubscriptions, IGetTopicNames, IGetTopicStats } from "../storage/backend.ts";

const FeedRequestSchema = z.object({
  human: HumanFlagSchema,
});

const FeedResponseSchema = z.object({
  topics: z.array(TopicSummarySchema),
  subscriptions: z.array(SubscriptionSummarySchema),
});

type FeedRequest = z.infer<typeof FeedRequestSchema>;

type FeedDeps = {
  storage: IGetTopicNames & IGetTopicStats & IGetSubscriptions;
};

async function getFeed(_deps: FeedDeps, _params: FeedRequest): Promise<Result<RouteSuccess, RouteError>> {
  return err({ kind: "internal", message: "not implemented" });
}

export function getFeedRoute(deps: FeedDeps): Route<null, FeedRequest, RouteSuccess, RouteSuccess, RouteError> {
  return {
    parseRequest: queryParser(FeedRequestSchema),
    handle: getFeed.bind(null, deps),
    parseResponse: responseParser(FeedResponseSchema),
  };
}
