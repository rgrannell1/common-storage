import { EnvironmentVariableMissingError } from "../shared/errors.ts";
import type { Config } from "../types/index.ts";

export class CommonStorageConfig {
  static REQUIRED = new Set([
    "CS_TITLE",
    "CS_DESCRIPTION",
    "CS_LOGGER",
    "CS_ADMIN_USERNAME",
    "CS_ADMIN_PASSWORD",
    "CS_KV_PATH",
    "CS_CAN_SUBSCRIBE"
  ]);

  static read(): Config {
    const config = {
      title: Deno.env.get("CS_TITLE"),
      description: Deno.env.get("CS_DESCRIPTION"),
      logger: Deno.env.get("CS_LOGGER"),
      adminUsername: Deno.env.get("CS_ADMIN_USERNAME"),
      adminPassword: Deno.env.get("CS_ADMIN_PASSWORD"),
      kvPath: Deno.env.get("CS_KV_PATH"),
      port: parseInt(Deno.env.get("CS_PORT") ?? "8080", 10),
      canSubscribe: Deno.env.get("CS_CAN_SUBSCRIBE") === "true",
    }

    const missingKeys: Set<string> = new Set();

    for (const [key, value] of Object.entries(config)) {
      if (!CommonStorageConfig.REQUIRED.has(key)) {
        continue;
      }

      if (!value) {
        missingKeys.add(key);
      }
    }

    if (missingKeys.size > 0) {
      const message = 'Required Common-Storage configuration missing! Please configure the following keys:\n${missingKeys.join(", ")}'
      throw new EnvironmentVariableMissingError(message);
    }

    return config as Config;
  }
}
