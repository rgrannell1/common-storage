// GET /feed — returns a JSON summary of all topics and active subscriptions
// @work.md

import { z } from "zod";
import { ok, type Result } from "../../commons/types/result.ts";
import type { Route } from "../../commons/types/parser.ts";
import type { RouteError, RouteSuccess } from "../../commons/types/responses.ts";
import { queryParser, responseParser } from "../parsers/combinators.ts";
import {
  HumanFlagSchema,
  TopicSummarySchema,
  SubscriptionSummarySchema,
} from "../parsers/schemas.ts";
import type {
  IGetSubscriptions,
  IGetTopicNames,
  IGetTopicStats,
} from "../../storage/capabilities.ts";

const FeedRequestSchema = z.object({
  human: HumanFlagSchema,
});

const FeedResponseSchema = z.object({
  topics: z.array(TopicSummarySchema),
  subscriptions: z.array(SubscriptionSummarySchema),
});

type FeedRequest = z.infer<typeof FeedRequestSchema>;
type FeedResponse = z.infer<typeof FeedResponseSchema>;

type FeedDeps = {
  storage: IGetTopicNames & IGetTopicStats & IGetSubscriptions;
};

function isPresent<Value>(val: Value | null): val is Value {
  return val !== null;
}

function formatTimestamp(ts: number, human: boolean): number | string {
  return human ? new Date(ts).toISOString() : ts;
}

async function getFeed(
  deps: FeedDeps,
  params: FeedRequest,
): Promise<Result<FeedResponse, RouteError>> {
  const names = await deps.storage.getTopicNames();
  const topicStats = await Promise.all(names.map(deps.storage.getTopicStats.bind(deps.storage)));

  // Drop null entries (topics that have no stats yet), then shape each into a summary object
  const topics = topicStats
    .filter(isPresent)
    .map(stats => ({
      topic: stats.topic,
      count: stats.stats.count,
      lastUpdated: formatTimestamp(stats.stats.lastUpdated, params.human),
    }));

  const subscriptions = await deps.storage.getSubscriptions();
  const formattedSubscriptions = subscriptions.map(sub => ({
    ...sub,
    created: formatTimestamp(sub.created, params.human),
  }));

  return ok({ topics, subscriptions: formattedSubscriptions });
}

export function getFeedRoute(
  deps: FeedDeps,
): Route<null, FeedRequest, FeedResponse, RouteSuccess, RouteError> {
  return {
    parseRequest: queryParser(FeedRequestSchema),
    handle: getFeed.bind(null, deps),
    parseResponse: responseParser(FeedResponseSchema),
  };
}
