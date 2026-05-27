// cs http — HTTP API client subcommand; maps CLI verb/noun commands onto the CmstrClient
// @work.md

import { CmstrClient, CmstrError } from "../../../../clients/ts/mod.ts";
import { loadConfig } from "../../../commons/config.ts";
import { resolveConfigFilePath } from "../../paths.ts";
import { parseParams, requireParam, parsePayload, parseOptionalInt, parseRequiredInt, parseIntList } from "./params.ts";
import { resolveServer, LOCAL_ALIAS } from "./server.ts";

function printResult(result: unknown): void {
  console.log(JSON.stringify(result, null, 2));
}

function handleError(err: unknown): never {
  if (err instanceof CmstrError) {
    console.error(`HTTP ${err.status}: ${JSON.stringify(err.body)}`);
  } else {
    console.error(String(err));
  }
  Deno.exit(1);
}

// Dispatches cs http verb noun commands to the appropriate API route via CmstrClient
export async function httpCommand(args: Record<string, unknown>): Promise<void> {
  const config = await loadConfig(resolveConfigFilePath(args["--cfg"] as string | null));
  const alias = (args["--server"] as string | null) ?? config.defaultServer ?? LOCAL_ALIAS;
  const server = resolveServer(config, alias);
  const client = new CmstrClient(server);
  const params = parseParams(args["-p"] as string | string[] | null);

  try {
    const payload = parsePayload(args["<payload>"] as string | null);
    if (args["feed"]) {
      printResult(await client.getFeed());
      return;
    }

    if (args["content"] && args["get"]) {
      const topic = requireParam(params, "topic");
      printResult(await client.getEvents({
        topic,
        start: parseOptionalInt(params, "start"),
        size: parseOptionalInt(params, "size"),
        filter: params["filter"],
        ids: parseIntList(params, "ids"),
      }));
      return;
    }

    if (args["entry"] && args["get"]) {
      const topic = requireParam(params, "topic");
      printResult(await client.getEvent({ topic, id: parseRequiredInt(params, "id") }));
      return;
    }

    if (args["content"] && args["post"]) {
      const topic = requireParam(params, "topic");
      printResult(await client.postEvent({ topic, payload }));
      return;
    }

    if (args["entry"] && args["put"]) {
      const topic = requireParam(params, "topic");
      printResult(await client.putEvent({ topic, id: parseRequiredInt(params, "id"), payload }));
      return;
    }

    if (args["objects"] && args["get"]) {
      const topic = requireParam(params, "topic");
      printResult(await client.getObjects({ topic, filter: params["filter"] }));
      return;
    }

    if (args["object"] && args["get"]) {
      const topic = requireParam(params, "topic");
      printResult(await client.getObject({ topic, id: requireParam(params, "id") }));
      return;
    }

    if (args["object"] && args["put"]) {
      const topic = requireParam(params, "topic");
      printResult(await client.putObject({ topic, id: requireParam(params, "id"), payload }));
      return;
    }

    if (args["object"] && args["delete"]) {
      const topic = requireParam(params, "topic");
      printResult(await client.deleteObject({ topic, id: requireParam(params, "id") }));
      return;
    }
  } catch (err) {
    handleError(err);
  }
}
