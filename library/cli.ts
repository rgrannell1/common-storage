
import docopt from "https://deno.land/x/docopt@v1.0.5/mod.ts";
import { CommonStorageClient } from "./comon-storage.ts";

const doc = `
Usage:
  common-storage <url> get-feed
  common-storage <url> get-user <name>
  common-storage <url> get-role <name>
  common-storage <url> get-topic <topic>
  common-storage <url> get-content <topic> [<start-id>]
  common-storage <url> get-subscription <topic>
  common-storage (-h | --help)

Options:
  -h --help     Show this screen
  --version     Show version
`;

const args = docopt(doc);
const url = args["<url>"];

const client = CommonStorageClient.new(url as string);

const username = Deno.env.get("CS_USERNAME");
const password = Deno.env.get("CS_PASSWORD");

function checkCredentials() {
  if (!username || !password) {
    console.error("Please set CS_USERNAME and CS_PASSWORD environment variables");
    Deno.exit(1);
  }
}

function callApi() {
  if (args["get-feed"]) {
    return client.getFeed()
  } else if (args["get-user"]) {
    checkCredentials();

    return client
      .withCredentials(username as string, password as string)
      .getUser(args['<name>'] as string)
  } else if (args["get-role"]) {
    checkCredentials();

    return client
      .withCredentials(username as string, password as string)
      .getRole(args['<name>'] as string)
  } else if (args["get-topic"]) {
    checkCredentials();

    return client
      .withCredentials(username as string, password as string)
      .getTopic(args['<topic>'] as string)
  } else if (args["get-subscription"]) {
    checkCredentials();

    return client
      .withCredentials(username as string, password as string)
      .getSubscription(args['<topic>'] as string)
  } else if (args["get-content"]) {
    checkCredentials();

    return client
      .withCredentials(username as string, password as string)
      .getContent(args['<topic>'] as string, args['<start-id>'] as number)
  }
}

const res = await callApi();
console.log(await res?.text());
