import { APIGatewayProxyEvent } from "https://deno.land/x/lambda@1.20.5/mod.ts";

import cfg from "../src/config.ts";
import * as rest from "../src/rest.ts";

const topicGet = async (event: APIGatewayProxyEvent) => {
  const { id } = event.queryStringParameters || {};

  const err = rest.requireParameter("id", id);
  if (err) {
    return err;
  }

  const topic = await cfg.storage.getTopic(id!);

  return {
    statusCode: 200,
    body: JSON.stringify({
      exists: topic !== undefined,
      topic,
    }),
  };
};

const topicPost = async (event: APIGatewayProxyEvent) => {
  const { id } = event.queryStringParameters || {};

  const err = rest.requireParameter("id", id);
  if (err) {
    return err;
  }

  const existed = await cfg.storage.addTopic(id!);

  return {
    statusCode: 200,
    body: JSON.stringify({
      existed,
    }),
  };
};

export const handler = async (
  event: APIGatewayProxyEvent,
) => {
  if (event.httpMethod === "GET") {
    return topicGet(event);
  }
  if (event.httpMethod === "POST") {
    return topicPost(event);
  }

  return rest.methodNotFound();
};
