import { NoOpLogger } from "../src/logger/noop.ts";
import { JsonLogger } from "../src/logger/json.ts";
import { Sqlite } from "../src/storage/sqlite/sqlite.ts";
import { Postgres } from "../src/storage/postgres/postgres.ts";
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

export function bindings(overrides: Record<string, any>) {
  const values: Record<string, any> = {
    CS_PORT: parseInt(getEnv("CS_PORT")),
    CS_TITLE: getEnv("CS_TITLE"),
    CS_DESCRIPTION: getEnv("CS_DESCRIPTION"),
    CS_USER: getEnv("CS_USER"),
    CS_PASSWORD: getEnv("CS_PASSWORD"),
    CS_DB_ENGINE: getEnv("CS_DB_ENGINE"),
    CS_LOGGER: getEnv("CS_LOGGER"),
    CS_UPSTREAM_USER: getEnv("CS_UPSTREAM_USER"),
    CS_UPSTREAM_PASSWORD: getEnv("CS_UPSTREAM_PASSWORD"),
  };

  if (values.CS_DB_ENGINE === "postgres") {
    values.CS_POSTGRES_DB_USER = getEnv("CS_POSTGRES_DB_USER");
    values.CS_POSTGRES_DB_PASSWORD = getEnv("CS_POSTGRES_DB_PASSWORD");
    values.CS_POSTGRES_DB_HOST = getEnv("CS_POSTGRES_DB_HOST");
    values.CS_POSTGRES_DB_NAME = getEnv("CS_POSTGRES_DB_NAME");
    values.CS_POSTGRES_DB_PORT = getEnv("CS_POSTGRES_DB_PORT");
    values.CS_POSTGRES_DB_CERT = getEnv("CS_POSTGRES_DB_CERT");
  } else if (values.CS_DB_ENGINE === "sqlite") {
    values.CS_SQLITE_DB_PATH = getEnv("CS_SQLITE_DB_PATH");
  } else {
    throw new Error(`Unknown storage engine ${values.CS_DB_ENGINE}`);
  }

  return {
    ...values,
    ...overrides,
  };
}

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

  if (CS_DB_ENGINE === "postgres") {
    return new Postgres({
      user: bindings.CS_POSTGRES_DB_USER,
      database: bindings.CS_POSTGRES_DB_NAME,
      hostname: bindings.CS_POSTGRES_DB_HOST,
      password: bindings.CS_POSTGRES_DB_PASSWORD,
      port: bindings.CS_POSTGRES_DB_PORT,
      tls: {
        caCertificates: [bindings.CS_POSTGRES_DB_CERT],
        enforce: true,
      },
    }) as any;
  } else if (CS_DB_ENGINE === "sqlite") {
    return new Sqlite({
      fpath: bindings.CS_SQLITE_DB_PATH,
    });
  } else {
    throw new Error(`storage engine ${CS_DB_ENGINE} not supported.`);
  }
}

/*
 * Return environmental variable bindings, and instantiated singleton classes
 * like storage and loggers
 *
 */
export function config(bindings: Record<string, any>) {
  return {
    port: bindings.CS_PORT,
    logger: getLogger(bindings),
    storage: getStorage(bindings),
    title: bindings.CS_TITLE,
    description: bindings.CS_DESCRIPTION,
    user: {
      name: bindings.CS_USER,
      password: bindings.CS_PASSWORD,
    },
    upstream: {
      name: bindings.CS_UPSTREAM_USER,
      password: bindings.CS_UPSTREAM_PASSWORD,
    },
  };
}
