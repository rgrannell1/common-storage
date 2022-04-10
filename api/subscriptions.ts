import { APIGatewayProxyEvent } from "https://deno.land/x/lambda@1.20.5/mod.ts";

import cfg from "../src/config.ts";
import * as rest from "../src/rest.ts";

const subscriptionsGet = async () => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      subscriptions: await cfg.storage.getSubscriptions(),
    }),
  };
};

const subscriptionsPost = async (event: APIGatewayProxyEvent) => {
  const { topic, hookUrl } = event.queryStringParameters ?? {};
  let err = rest.requireParameter("topic", topic);
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

  if (!await cfg.storage.getTopic(topic!)) {
    return {
      statusCode: 404,
      body: JSON.stringify({
        error: {
          message: `topic '${topic}' does not exist; cannot subscribe to it`,
        },
      }),
    };
  }

  const id = await cfg.storage.addSubscription(topic!, hookUrl!);

  return {
    statusCode: 404,
    body: JSON.stringify({
      id,
      hookUrl,
      topic,
    }),
  };
};

export const handler = async (
  event: APIGatewayProxyEvent,
) => {
  console.log(event);

  if (event.httpMethod === "GET") {
    return subscriptionsGet();
  } else if (event.httpMethod === "POST") {
    return subscriptionsPost(event);
  }

  return rest.methodNotFound();
};
