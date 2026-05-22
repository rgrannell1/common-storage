// cs mint — print a Macaroon token for a named token definition in config

import { loadConfig } from "../../commons/config.ts";
import { mintToken } from "../../commons/auth.ts";
import { resolveConfigFilePath } from "../paths.ts";

function resolveRootKey(envVarName: string): string {
  const rootKey = Deno.env.get(envVarName);
  if (!rootKey) {
    console.error(`Root key env var '${envVarName}' is not set`);
    Deno.exit(1);
  }
  return rootKey;
}

// Prints a token for the named definition, or all name/token pairs if name is undefined
export async function mint(name: string | undefined, cfgArg: string | null): Promise<void> {
  const config = await loadConfig(resolveConfigFilePath(cfgArg));
  const rootKey = resolveRootKey(config.rootKey);
  const tokens = config.tokens ?? [];

  if (name !== undefined) {
    const tokenDef = tokens.find(token => token.name === name);
    if (!tokenDef) {
      console.error(`Token '${name}' not found in config`);
      Deno.exit(1);
    }
    console.log(mintToken(rootKey, tokenDef.name, tokenDef.caveats));
    return;
  }

  for (const tokenDef of tokens) {
    console.log(`${tokenDef.name}: ${mintToken(rootKey, tokenDef.name, tokenDef.caveats)}`);
  }
}
