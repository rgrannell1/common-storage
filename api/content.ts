import { APIGatewayProxyEvent } from "https://deno.land/x/lambda@1.20.5/mod.ts";

import cfg from "../src/config.ts";
import * as constants from "../src/constants.ts";
import * as services from "../src/services.ts";
import * as rest from "../src/rest.ts";

const contentGet = async (event: APIGatewayProxyEvent) => {
  const {
    id,
    lastId,
    size = constants.DEFAULT_SIZE,
  } = event.queryStringParameters ?? {};

  let err = rest.requireParameter("id", id);
  if (err) {
    return err;
  }

  const data = await cfg.storage.getContent(
    id!,
    lastId ? parseInt(lastId) : 0,
    parseInt(size),
  );

  return {
    statusCode: 200,
    body: JSON.stringify(data),
  };
};

const contentPost = async (event: APIGatewayProxyEvent) => {
  const { id } = event.queryStringParameters ?? {};
  let err = rest.requireParameter("id", id);
  if (err) {
    return err;
  }

  const { batchId, events } = JSON.parse(event.body ?? "{}");
  const { finished } = await cfg.storage.addContent(id!, batchId, events);

  if (finished) {
    await services.notifySubscriptions(cfg.storage, id!);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      batchId,
      topic: id,
      finished,
    }),
  };
};

export const handler = async (
  event: APIGatewayProxyEvent,
) => {
  if (event.httpMethod === "POST") {
    return contentPost(event);
  }
  if (event.httpMethod === "GET") {
    return contentGet(event);
  }

  return rest.methodNotFound();
};
