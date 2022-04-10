import { APIGatewayProxyEvent } from "https://deno.land/x/lambda@1.20.5/mod.ts";

import cfg from "../src/config.ts";
import * as rest from "../src/rest.ts";

const subscriptionGet = async (event: APIGatewayProxyEvent) => {
  const { id } = event?.queryStringParameters || {};
  let err = rest.requireParameter("id", id);
  if (err) {
    return err;
  }

  const subscription = await cfg.storage.getSubscription(id!);

  return {
    statusCode: 200,
    body: JSON.stringify({
      exist: subscription !== undefined,
      subscription: subscription ?? {},
    }),
  };
};

const subscriptionPost = async (event: APIGatewayProxyEvent) => {
  const { id, topic, hookUrl } = event?.queryStringParameters || {};
  let err = rest.requireParameter("id", id);
  if (err) {
    return err;
  }
  err = rest.requireParameter("topic", topic);
  if (err) {
    return err;
  }
  err = rest.requireParameter("hookUrl", hookUrl);
  if (err) {
    return err;
  }

  try {
    new URL(hookUrl!);
  } catch {
    return {
      statusCode: 422,
      body: JSON.stringify({
        error: {
          message: "hookUrl must be a valid URL.",
        },
      }),
    };
  }

  await cfg.storage.updateSubscription(id!, topic!, hookUrl!);

  return {
    statusCode: 200,
    body: JSON.stringify({
      id,
      topic,
      hookUrl,
    }),
  };
};

const subscriptionDelete = async (event: APIGatewayProxyEvent) => {
  const { id } = event?.queryStringParameters || {};
  const err = rest.requireParameter("id", id);
  if (err) {
    return err;
  }

  const existed = await cfg.storage.deleteSubscription(id!);

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
    return subscriptionGet(event);
  } else if (event.httpMethod === "POST") {
    return subscriptionPost(event);
  } else if (event.httpMethod === "DELETE") {
    return subscriptionDelete(event);
  }

  return rest.methodNotFound();
};
