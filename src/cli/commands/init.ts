// cs init — open $EDITOR with the config, validate on exit, and set up the server
// @design.md

import { Config } from "../../commons/config.ts";
import { DEFAULT_PORT } from "../../commons/constants.ts";
import { ok, err, type Result } from "../../commons/types/result.ts";
import { xdgConfigHome, resolveConfigPath, parentDir } from "../paths.ts";
import { openEditor, promptYesNo } from "../prompt.ts";
import { promptSetup } from "../setup.ts";

const CONFIG_SKELETON = JSON.stringify({
  server: { port: DEFAULT_PORT },
  rootKey: "COMMON_STORAGE_ROOT_KEY",
}, null, 2);

async function ensureConfig(path: string): Promise<void> {
  try {
    await Deno.stat(path);
  } catch {
    await Deno.mkdir(parentDir(path), { recursive: true });
    await Deno.writeTextFile(path, CONFIG_SKELETON);
  }
}

function parseJson(text: string): Result<unknown, string> {
  try {
    return ok(JSON.parse(text));
  } catch (parseErr) {
    return err(String(parseErr));
  }
}

function validateConfig(raw: unknown): Result<Config, string[]> {
  const result = Config.safeParse(raw);
  if (result.success) {
    return ok(result.data);
  }
  const errors = result.error.errors.map(zodErr => `${zodErr.path.join(".")}: ${zodErr.message}`);
  return err(errors);
}

async function validateFile(path: string): Promise<Result<Config, string[]>> {
  const text = await Deno.readTextFile(path);
  const parsed = parseJson(text);
  if (!parsed.ok) {
    return err([`Not valid JSON: ${parsed.error}`]);
  }
  return validateConfig(parsed.value);
}

async function editLoop(path: string): Promise<boolean> {
  while (true) {
    await openEditor(path);

    const result = await validateFile(path);
    if (result.ok) {
      return true;
    }

    console.error("Config is invalid:");
    for (const error of result.error) {
      console.error(`  ${error}`);
    }

    const retry = promptYesNo("Re-open editor?");
    if (!retry) {
      return false;
    }
  }
}

export async function init(): Promise<void> {
  const xdgHome = xdgConfigHome();
  const path = resolveConfigPath(xdgHome);

  await ensureConfig(path);
  console.log(`Config: ${path}`);

  const valid = await editLoop(path);
  if (!valid) {
    console.error("Aborted — config is not valid.");
    Deno.exit(1);
  }

  console.log("Config is valid.");
  await promptSetup(xdgHome);
}
