// cs init — create a config skeleton at the XDG config path if one does not already exist
// @work.md

import { DEFAULT_PORT, ROOT_KEY_ENV_VAR } from "../../commons/constants.ts";
import { xdgConfigHome, resolveConfigPath, parentDir } from "../paths.ts";

const CONFIG_SKELETON = JSON.stringify({
  server: { port: DEFAULT_PORT },
  rootKey: ROOT_KEY_ENV_VAR,
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

export async function init(): Promise<void> {
  const path = resolveConfigPath(xdgConfigHome());

  if (await configExists(path)) {
    console.log(`Config already exists: ${path}`);
    return;
  }

  await createSkeleton(path);
  console.log(`Created config: ${path}`);
}
