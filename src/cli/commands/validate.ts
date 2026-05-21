// cs validate — parse and validate the config file, reporting any errors
// @work.md

import { validateConfigText, readConfigText } from "../../commons/config.ts";
import { xdgConfigHome, resolveConfigPath } from "../paths.ts";

async function readOrExit(path: string): Promise<string> {
  try {
    return await readConfigText(path);
  } catch {
    console.error(`Config not found: ${path}`);
    console.error(`Run 'cs init' to create one.`);
    return Deno.exit(1);
  }
}

export async function validate(): Promise<void> {
  const path = resolveConfigPath(xdgConfigHome());
  const text = await readOrExit(path);
  const errors = validateConfigText(text);

  if (errors.length === 0) {
    console.log(`Config is valid: ${path}`);
    return;
  }

  console.error(`Config is invalid: ${path}`);
  for (const error of errors) {
    console.error(`  ${error}`);
  }
  Deno.exit(1);
}
