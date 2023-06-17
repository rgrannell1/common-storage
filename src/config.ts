import { NoOpLogger } from "../src/logger/noop.ts";
import { JsonLogger } from "../src/logger/json.ts";
import { Sqlite } from "../src/storage/sqlite/sqlite.ts";
import { IStorage } from "./types/interfaces/storage.ts";
import { ILogger } from "./types/interfaces/logger.ts";

/*
 * Get an environmental variable, throwing an exception when absent
 */
function getEnv(name: string) {
  const res = Deno.env.get(name);
  if (!res) {
    throw new TypeError(`${name} missing`);
  }
  return res;
}

/*
 * Retrieve environmental variables, and optionally allow overrides
 * with an override dictionary.
 */
export function bindings(overrides: Record<string, any>) {
  const values: Record<string, any> = {
    CS_PORT: parseInt(getEnv("CS_PORT")),
    CS_TITLE: getEnv("CS_TITLE"),
    CS_DESCRIPTION: getEnv("CS_DESCRIPTION"),
    CS_DB_ENGINE: getEnv("CS_DB_ENGINE"),
    CS_LOGGER: getEnv("CS_LOGGER"),
    CS_SQLITE_DB_PATH: getEnv("CS_SQLITE_DB_PATH"),
  };

  return {
    ...values,
    ...overrides,
  };
}

/*
 * Instantiate a logger
 */
export function getLogger(bindings: Record<string, any>): ILogger {
  if (bindings.CS_LOGGER === "noop") {
    return new NoOpLogger();
  } else if (bindings.CS_LOGGER === "json") {
    return new JsonLogger();
  } else {
    throw new Error("Unknown logger");
  }
}

export function getStorage(bindings: Record<string, any>): IStorage {
  const CS_DB_ENGINE = bindings.CS_DB_ENGINE;

  if (CS_DB_ENGINE === "sqlite") {
    return new Sqlite({
      fpath: bindings.CS_SQLITE_DB_PATH ?? "/cs.db",
    });
  } else {
    throw new Error(`storage engine ${CS_DB_ENGINE} not supported.`);
  }
}

export function getUsers(_: Record<string, any>): Record<string, any> {
  // import users.json
  const users = JSON.parse(Deno.readTextFileSync("./users.json"));

  return users;
}

/*
 * Return environmental variable bindings, and instantiated singleton classes
 * like storage and loggers
 */
export function config(bindings: Record<string, any>) {
  return {
    port: bindings.CS_PORT,
    logger: getLogger(bindings),
    storage: getStorage(bindings),
    title: bindings.CS_TITLE,
    description: bindings.CS_DESCRIPTION,
    users: getUsers(bindings)
  };
}
