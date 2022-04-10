import { APIGatewayProxyEvent } from "https://deno.land/x/lambda@1.20.5/mod.ts";

import cfg from "../src/config.ts";
import * as rest from "../src/rest.ts";

const feedGet = async () => {
  const topicNames = await cfg.storage.getTopicNames();

  const topicStats = await Promise.all(
    topicNames.map(async (topicName: string) => {
      return await cfg.storage.getTopicStats(topicName);
    }),
  );

  return {
    statusCode: 200,
    body: JSON.stringify({
      type: "common-storage",
      version: "v0.1",
      topics: topicStats,
    }),
  };
};

export const handler = async (
  event: APIGatewayProxyEvent,
) => {
  if (event.httpMethod === "GET") {
    return feedGet();
  }

  return rest.methodNotFound();
};
