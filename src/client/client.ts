#!/bin/sh
//bin/true; exec /home/rg/.deno/bin/deno run -A "$0" "$@"

import docopt from "https://deno.land/x/docopt@v1.0.1/dist/docopt.mjs";
import { API } from "./api.ts";

export const CLI = `
Usage:
  cs get topic <topic> [--dev]
  cs post topic <topic> --description <description> [--dev]
  cs delete topic <topic> [--dev]
  cs get content <topic> [--startId <id>] [--dev]
  cs post content <content> [--batchId <id>] [--dev]
  cs post subscription <topic> [--target=<id>] [--frequency=<freq>] [--dev]
  cs get feed

Description:
  Call common-storage
`;

const args = docopt(CLI);

function makeRequest() {
  const client = new API(args["--dev"]);

  if (args.feed && args.get) {
    return client.getFeed();
  }

  if (args.topic) {
    if (args.get) {
      return client.getTopic(args["<topic>"]);
    } else if (args.post) {
      return client.postTopic(args["<topic>"], args["--description"]);
    } else if (args.delete) {
      return client.deleteTopic(args["<topic>"]);
    } else {
      throw new Error("topic method not supported");
    }
  }

  if (args.content) {
    if (args.get) {
      return client.getContent(args["<topic>"]);
    } else {
      throw new Error("content method not supported");
    }
  }

  if (args.subscription) {
    if (args.post) {
      console.log(args);
      return client.postSubscription(
        args["<topic>"],
        args["--target"],
        args["--frequency"],
      );
    } else {
      throw new Error("subscription method not supported");
    }
  }
}

const res: any = await makeRequest();
const body = await res.text();

try {
  console.log(body);
} catch {
  console.log(body);
}
