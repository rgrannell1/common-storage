// cs http — HTTP API client submodule; maps CLI verb/noun commands onto server routes

import { loadConfig } from "../../../commons/config.ts";
import { resolveConfigFilePath } from "../../paths.ts";
import { parseParams, buildQuery, requireParam, parsePayload } from "./params.ts";
import { resolveServer, LOCAL_ALIAS } from "./server.ts";
import { apiFetch } from "./fetch.ts";

// Dispatches cs http verb noun commands to the appropriate API route
export async function httpCommand(args: Record<string, unknown>): Promise<void> {
  const config = await loadConfig(resolveConfigFilePath(args["--cfg"] as string | null));
  const alias = (args["--server"] as string | null) ?? config.defaultServer ?? LOCAL_ALIAS;
  const server = resolveServer(config, alias);
  const params = parseParams(args["-p"] as string | string[] | null);
  const payload = parsePayload(args["<payload>"] as string | null);

  if (args["feed"]) {
    await apiFetch(server, "/feed", "GET");
    return;
  }

  if (args["content"] && args["get"]) {
    const topic = requireParam(params, "topic");
    const query = buildQuery({ start: params["start"], size: params["size"] });
    await apiFetch(server, `/events/${encodeURIComponent(topic)}${query}`, "GET");
    return;
  }

  if (args["entry"] && args["get"]) {
    const topic = requireParam(params, "topic");
    const id = requireParam(params, "id");
    await apiFetch(server, `/events/${encodeURIComponent(topic)}/${encodeURIComponent(id)}`, "GET");
    return;
  }

  if (args["content"] && args["post"]) {
    const topic = requireParam(params, "topic");
    await apiFetch(server, `/events/${encodeURIComponent(topic)}`, "POST", payload);
    return;
  }

  if (args["entry"] && args["put"]) {
    const topic = requireParam(params, "topic");
    const id = requireParam(params, "id");
    await apiFetch(server, `/events/${encodeURIComponent(topic)}/${encodeURIComponent(id)}`, "PUT", payload);
    return;
  }

  if (args["objects"] && args["get"]) {
    const topic = requireParam(params, "topic");
    await apiFetch(server, `/objects/${encodeURIComponent(topic)}`, "GET");
    return;
  }

  if (args["object"] && args["get"]) {
    const topic = requireParam(params, "topic");
    const id = requireParam(params, "id");
    await apiFetch(server, `/objects/${encodeURIComponent(topic)}/${encodeURIComponent(id)}`, "GET");
    return;
  }

  if (args["object"] && args["put"]) {
    const topic = requireParam(params, "topic");
    const id = requireParam(params, "id");
    await apiFetch(server, `/objects/${encodeURIComponent(topic)}/${encodeURIComponent(id)}`, "PUT", payload);
    return;
  }

  if (args["object"] && args["delete"]) {
    const topic = requireParam(params, "topic");
    const id = requireParam(params, "id");
    await apiFetch(server, `/objects/${encodeURIComponent(topic)}/${encodeURIComponent(id)}`, "DELETE");
    return;
  }
}
