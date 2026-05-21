// cs init — create a config skeleton if absent, or validate the existing config
// @work.md

import { Config } from "../../commons/config.ts";
import { DEFAULT_PORT } from "../../commons/constants.ts";
import { xdgConfigHome, resolveConfigPath, parentDir } from "../paths.ts";

const CONFIG_SKELETON = JSON.stringify({
  server: { port: DEFAULT_PORT },
  rootKey: "COMMON_STORAGE_ROOT_KEY",
}, null, 2);

async function configExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

async function createSkeleton(path: string): Promise<void> {
  await Deno.mkdir(parentDir(path), { recursive: true });
  await Deno.writeTextFile(path, CONFIG_SKELETON);
}

function validateConfig(text: string): string[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (parseErr) {
    return [`Not valid JSON: ${parseErr}`];
  }

  const result = Config.safeParse(raw);
  if (result.success) return [];
  return result.error.errors.map(zodErr => `${zodErr.path.join(".")}: ${zodErr.message}`);
}

export async function init(): Promise<void> {
  const path = resolveConfigPath(xdgConfigHome());

  if (!await configExists(path)) {
    await createSkeleton(path);
    console.log(`Created config: ${path}`);
    return;
  }

  console.log(`Config: ${path}`);
  const text = await Deno.readTextFile(path);
  const errors = validateConfig(text);

  if (errors.length === 0) {
    console.log("Config is valid.");
    return;
  }

  console.error("Config is invalid:");
  for (const error of errors) {
    console.error(`  ${error}`);
  }
  Deno.exit(1);
}
