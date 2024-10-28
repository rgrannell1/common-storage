import { COMMON_STORAGE_VERSION } from "../shared/constants.ts";
import { Status } from "../shared/status.ts";
import {
  type Config,
  type CSContext,
  type IError,
  type IGetSubscriptions,
  type IGetTopicNames,
  type IGetTopicStats,
  type IInfo,
  RequestPart,
  type SchemaValidator,
  type TopicStats,
} from "../types/index.ts";

type Services = {
  storage: IGetTopicNames & IGetTopicStats & IGetSubscriptions;
  logger: IInfo & IError;
  schema: SchemaValidator;
};

type GetFeedConfig = Partial<Config> & {
  description: string;
  title: string;
};

function formatTopicDates(topic: TopicStats | null) {
  if (!topic) {
    return topic;
  }

  const data: any = topic;

  data.stats.lastUpdated = new Date(data.stats.lastUpdated).toISOString();

  return data;
}

function getApiSummary() {
  return {
    "users": {
      "GET /user": "Get information about registered users",
      "GET /user/:name": "Get user information",
      "POST /user/:name": "Add a user",
    },
    "subscriptions": {
      "POST /subscription/:topic": "Subscribe to a common-storage topic",
    },
    "role": {
      "GET /role/:role": "Get permission details about a role",
      "POST /role/:role": "Create a new permissions role",
    },
    "feed": {
      "GET /feed": "Retrieve general information about this server",
    },
    "content": {
      "GET /content/:topic": "Retrieve a collection of content from a topic",
      "POST /content/:topic": "Add content to a topic",
    },
    "topic": {
      "GET /topic/:topic": "Get metadata about a topic",
      "POST /topic/:topic": "Add a topic to the server",
      "DELETE /topic/:topic": "Delete a topic from the server",
    },
  };
}

export function getFeed(cfg: GetFeedConfig, services: Services) {
  const { storage, schema } = services;

  return async function (ctx: CSContext) {
    const params = {
      ...ctx.params,
      human: ctx?.request?.url?.searchParams?.has("human"),
    };
    schema("feedGet", params, RequestPart.Params);

    const topicNames = await storage.getTopicNames();

    const topicsPromises = Promise.all(
      topicNames.map((topicName: string) => storage.getTopicStats(topicName)),
    );

    const [topics, subscriptions] = await Promise.all([
      topicsPromises,
      storage.getSubscriptions(),
    ]);

    const subscriptionMap: Record<string, { source: string }> = {};
    for (const sub of subscriptions) {
      subscriptionMap[sub.target] = {
        source: sub.source,
      };
    }

    ctx.response.status = Status.OK;
    ctx.response.body = JSON.stringify({
      description: cfg.description,
      title: cfg.title,
      version: COMMON_STORAGE_VERSION,
      topics: params.human ? topics.map(formatTopicDates) : topics,
      subscriptions: subscriptionMap,
      apiOverview: getApiSummary(),
    });
  };
}
