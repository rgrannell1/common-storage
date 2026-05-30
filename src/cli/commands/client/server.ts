// Server alias resolution — maps an alias name to a base URL and bearer token

import { type Config } from "../../../commons/config.ts";
import { mintToken } from "../../../commons/auth.ts";

// Default alias name that connects to localhost with an auto-minted root token
export const LOCAL_ALIAS = "local";

export type ResolvedServer = { url: string; token: string };

// Mints an uncaveated root token and returns the localhost URL for the local alias
function resolveLocalServer(config: Config): ResolvedServer {
  const rootKey = Deno.env.get(config.rootKey);
  if (!rootKey) {
    console.error(`Root key env var '${config.rootKey}' is not set`);
    Deno.exit(1);
  }
  const token = mintToken(rootKey, LOCAL_ALIAS, {});
  const aliasOverride = config.aliases?.find(entry => entry.name === LOCAL_ALIAS);
  const url = aliasOverride?.url ?? `http://localhost:${config.server.port}`;
  return { url, token };
}

// Resolves a named alias to URL + token, reading the token from its configured env var
function resolveRemoteServer(config: Config, alias: string): ResolvedServer {
  const aliasConfig = config.aliases?.find(entry => entry.name === alias);
  if (!aliasConfig) {
    console.error(`Server alias '${alias}' not found in config`);
    Deno.exit(1);
  }
  if (!aliasConfig.token) {
    console.error(`Server alias '${alias}' has no token env var configured`);
    Deno.exit(1);
  }
  const token = Deno.env.get(aliasConfig.token);
  if (!token) {
    console.error(`Token env var '${aliasConfig.token}' is not set`);
    Deno.exit(1);
  }
  return { url: aliasConfig.url, token };
}

export function resolveServer(config: Config, alias: string): ResolvedServer {
  return alias === LOCAL_ALIAS
    ? resolveLocalServer(config)
    : resolveRemoteServer(config, alias);
}

// Returns the URL for a named alias without resolving a token; used by commands that
// mint their own token
export function resolveAliasUrl(config: Config, alias: string): string {
  const aliasConfig = config.aliases?.find(entry => entry.name === alias);
  if (!aliasConfig) {
    console.error(`Server alias '${alias}' not found in config`);
    Deno.exit(1);
  }
  return aliasConfig.url;
}
