#!/bin/sh
//bin/true; exec /home/rg/.deno/bin/deno run -A "$0" "$@"

import docopt from "https://deno.land/x/docopt@v1.0.1/dist/docopt.mjs";
import API from "./api.ts";

export const CLI = `
Usage:
  cs get topic <topic>
  cs post topic <topic> --description <description>
  cs delete topic <topic>
  cs get content <topic> [--startId <id>]
  cs post content <content> [--batchId <id>]
  cs get feed

Description:
  Call common-storage
`;

const args = docopt(CLI);

function makeRequest() {
  if (args.feed && args.get) {
    return API.getFeed();
  }

  if (args.topic) {
    if (args.get) {
      return API.getTopic(args["<topic>"]);
    } else if (args.post) {
      return API.postTopic(args["<topic>"], args["--description"]);
    } else if (args.delete) {
      return API.deleteTopic(args["<topic>"]);
    }
  } else if (args.content) {
    if (args.get) {
      return API.getContent(args["<topic>"]);
    }
  }
}

const res: any = await makeRequest();
console.log(JSON.stringify(await res.json()));
