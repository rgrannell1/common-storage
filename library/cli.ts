import docopt from "https://deno.land/x/docopt@v1.0.5/mod.ts";
import { CommonStorageClient } from "./common-storage.ts";

const doc = `
Usage:
  common-storage <url> get-feed                         [--user=<cred>]
  common-storage <url> get-user <name>                  [--user=<cred>]
  common-storage <url> get-role <name>                  [--user=<cred>]
  common-storage <url> get-topic <topic>                [--user=<cred>]
  common-storage <url> get-content <topic> [<start-id>] [--user=<cred>]
  common-storage <url> get-all-content <topic>          [--user=<cred>]
  common-storage <url> get-subscription <topic>         [--user=<cred>]
  common-storage (-h | --help)

Options:
  --user=<cred>    User credentials
  -h, --help       Show this screen
  --version        Show version
`;

const args = docopt(doc);
const url = args["<url>"];

const client = CommonStorageClient.new(url as string);

function getCredential() {
  if (args["--user"]) {
    const [username, password] = (args["--user"] as string).split(":", 1);
    return { username, password };
  }

  const username = Deno.env.get("CS_USERNAME");
  const password = Deno.env.get("CS_PASSWORD");

  return { username, password };
}

function checkCredentials() {
  const { username, password } = getCredential();

  if (!username || !password) {
    console.error(
      "Please set CS_USERNAME and CS_PASSWORD environment variables",
    );
    Deno.exit(1);
  }
}

function callApi() {
  const { username, password } = getCredential();

  if (args["get-feed"]) {
    return client.getFeed();
  } else if (args["get-user"]) {
    checkCredentials();

    return client
      .withCredentials(username as string, password as string)
      .getUser(args["<name>"] as string);
  } else if (args["get-role"]) {
    checkCredentials();

    return client
      .withCredentials(username as string, password as string)
      .getRole(args["<name>"] as string);
  } else if (args["get-topic"]) {
    checkCredentials();

    return client
      .withCredentials(username as string, password as string)
      .getTopic(args["<topic>"] as string);
  } else if (args["get-subscription"]) {
    checkCredentials();

    return client
      .withCredentials(username as string, password as string)
      .getSubscription(args["<topic>"] as string);
  } else if (args["get-content"]) {
    checkCredentials();

    return client
      .withCredentials(username as string, password as string)
      .getContent(args["<topic>"] as string, args["<start-id>"] as number);
  }
}

if (args["get-all-content"]) {
  const { username, password } = getCredential();
  checkCredentials();

  const allContent = client
    .withCredentials(username as string, password as string)
    .getAllContent(args["<topic>"] as string, 1_000);

  for await (const content of allContent) {
    console.log(JSON.stringify(content));
  }
} else {
  const res = await callApi();
  console.log(await res?.text());
}
