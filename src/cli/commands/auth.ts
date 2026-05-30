// cs auth — print a QR code for a token URL targeting a named server alias
// @work.md

// deno-lint-ignore-file no-explicit-any
import QRCode from "qrcode";

import { loadConfig } from "../../commons/config.ts";
import { mintToken } from "../../commons/auth.ts";
import { resolveConfigFilePath } from "../paths.ts";
import { resolveEnvVar } from "../shell.ts";
import { resolveAliasUrl } from "./client/server.ts";
import type { TokenConfig } from "../../commons/config.ts";

function buildTokenUrl(baseUrl: string, token: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

async function printQr(label: string, url: string): Promise<void> {
  const qr = await (QRCode as any).toString(url, { type: "terminal", small: true });
  console.log(`\n${label}`);
  console.log(qr);
}

async function printTokenQr(
  rootKey: string,
  baseUrl: string,
  tokenDef: TokenConfig,
): Promise<void> {
  const token = mintToken(rootKey, tokenDef.name, tokenDef.caveats);
  const url   = buildTokenUrl(baseUrl, token);
  await printQr(tokenDef.name, url);
}

// Prints QR codes for a named token, or all token definitions if name is undefined
export async function auth(
  alias: string,
  name: string | undefined,
  cfgArg: string | null,
): Promise<void> {
  const config  = await loadConfig(resolveConfigFilePath(cfgArg));
  const rootKey = resolveEnvVar(config.rootKey);
  const baseUrl = resolveAliasUrl(config, alias);
  const tokens  = config.tokens ?? [];

  if (name !== undefined) {
    const tokenDef = tokens.find(token => token.name === name);
    if (!tokenDef) {
      console.error(`Token '${name}' not found in config`);
      Deno.exit(1);
    }
    await printTokenQr(rootKey, baseUrl, tokenDef);
    return;
  }

  for (const tokenDef of tokens) {
    await printTokenQr(rootKey, baseUrl, tokenDef);
  }
}
