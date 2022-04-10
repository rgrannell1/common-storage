import { APIGatewayProxyEvent } from "https://deno.land/x/lambda@1.20.5/mod.ts";

import * as rest from "../src/rest.ts";

/**
 * Route to other functions
 *
 * @param {APIGatewayProxyEvent} event
 */
const handler = async (event: APIGatewayProxyEvent) => {
  const path = event.path.replace("/.netlify/functions/v1", "");

  let location = "";
  if (path.startsWith("/feed")) {
    location = "/.netlify/functions/feed";
  } else if (path === "/subscription") {
    location = "/.netlify/functions/subscription";
  } else if (path.startsWith("/topic")) {
    const match = path.match(/\/topic\/(?<id>.+)/);
    const id = match?.groups?.id;

    let err = rest.requireParameter("id", id);
    if (err) {
      return err;
    }

    location = `/.netlify/functions/topic?id=${id}`;
  }

  if (!location) {
    return {
      statusCode: 404,
      body: JSON.stringify({
        error: {
          message: `could not route "${event.path}"`,
        },
      }),
    };
  } else {
    return {
      statusCode: 302,
      headers: {
        Location: location,
      },
    };
  }
};

export { handler };
