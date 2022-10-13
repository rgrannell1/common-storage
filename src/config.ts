import { Logger } from "../src/logger/logger.ts";
import { Sqlite } from "../src/storage/sqlite/sqlite.ts";
import { Postgres } from "../src/storage/postgres/postgres.ts";
import { IStorage } from "./interfaces/storage.ts";

function getEnv(name: string) {
  const res = Deno.env.get(name);
  if (!res) {
    throw new Error(`${name} missing`);
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
    throw new Error("Unknown storage engine");
  }

  return {
    ...values,
    ...overrides,
  };
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
    });
  } else if (CS_DB_ENGINE === "sqlite") {
    return new Sqlite({
      fpath: bindings.CS_SQLITE_DB_PATH,
    });
  } else {
    throw new Error(`storage engine ${CS_DB_ENGINE} not supported.`);
  }
}

export function config(bindings: Record<string, any>) {
  return {
    port: bindings.CS_PORT,
    logger: new Logger(),
    storage: getStorage(bindings),
    title: bindings.CS_TITLE,
    description: bindings.CS_DESCRIPTION,
    user: {
      name: bindings.CS_USER,
      password: bindings.CS_PASSWORD,
    },
  };
}
