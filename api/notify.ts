import { APIGatewayProxyEvent } from "https://deno.land/x/lambda@1.20.5/mod.ts";

import * as rest from "../src/rest.ts";

const notifyPost = async (event: APIGatewayProxyEvent) => {
  const { subscriptionId, topic } = event?.queryStringParameters || {};
  let err = rest.requireParameter("subscriptionId", subscriptionId);
  if (err) {
    return err;
  }

  err = rest.requireParameter("topic", topic);
  if (err) {
    return err;
  }

  console.log(JSON.stringify({
    message: "POST notify/ received",
    subscriptionId,
    topic,
  }));

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: "OK",
    }),
  };
};

export const handler = async (
  event: APIGatewayProxyEvent,
) => {
  if (event.httpMethod === "POST") {
    await notifyPost(event);
  }

  return rest.methodNotFound();
};
