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

const CS_PORT = parseInt(getEnv("CS_PORT"));
const CS_TITLE = getEnv("CS_TITLE");
const CS_DESCRIPTION = getEnv("CS_DESCRIPTION");
const CS_USER = getEnv("CS_USER");
const CS_PASSWORD = getEnv("CS_PASSWORD");

if (!CS_USER || !CS_PASSWORD) {
  throw new Error("please set CS_USER and CS_PASSWORD!");
}

export function getStorage(): IStorage {
  const CS_DB_ENGINE = getEnv("CS_DB_ENGINE");

  if (CS_DB_ENGINE === "postgres") {
    const CS_POSTGRES_DB_USER = getEnv("CS_POSTGRES_DB_USER");
    const CS_POSTGRES_DB_PASSWORD = getEnv("CS_POSTGRES_DB_PASSWORD");
    const CS_POSTGRES_DB_HOST = getEnv("CS_POSTGRES_DB_HOST");
    const CS_POSTGRES_DB_NAME = getEnv("CS_POSTGRES_DB_NAME");
    const CS_POSTGRES_DB_PORT = getEnv("CS_POSTGRES_DB_PORT");
    const CS_POSTGRES_DB_CERT = getEnv("CS_POSTGRES_DB_CERT");

    const certificate = atob(CS_POSTGRES_DB_CERT ?? "");

    return new Postgres({
      user: CS_POSTGRES_DB_USER,
      database: CS_POSTGRES_DB_NAME,
      hostname: CS_POSTGRES_DB_HOST,
      password: CS_POSTGRES_DB_PASSWORD,
      port: CS_POSTGRES_DB_PORT,
      tls: {
        caCertificates: [certificate],
        enforce: true,
      },
    });
  } else if (CS_DB_ENGINE === "sqlite") {
    const CS_SQLITE_DB_PATH = getEnv("CS_SQLITE_DB_PATH");

    return new Sqlite({
      fpath: CS_SQLITE_DB_PATH,
    });
  } else {
    throw new Error(`storage engine ${CS_DB_ENGINE} not supported.`);
  }
}

let x = getStorage();
export const config = {
  port() {
    return CS_PORT;
  },
  logger() {
    return new Logger();
  },
  storage() {
    //return getStorage();
    return x;
  },
  title() {
    return CS_TITLE;
  },
  description() {
    return CS_DESCRIPTION;
  },
  user() {
    return {
      name: CS_USER,
      password: CS_PASSWORD,
    };
  },
};
