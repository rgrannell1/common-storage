import { Logger } from "../src/logger/logger.ts";
import { Sqlite } from "../src/storage/sqlite/sqlite.ts";
import { Postgres } from "../src/storage/postgres/postgres.ts";

const CS_PORT = parseInt(Deno.env.get("CS_PORT") || "8080");
const CS_TITLE = Deno.env.get("CS_TITLE") ||
  "Just another common-storage server";
const CS_DESCRIPTION = Deno.env.get("CS_DESCRIPTION") || "";
const CS_USER = Deno.env.get("CS_USER");
const CS_PASSWORD = Deno.env.get("CS_PASSWORD");
const CS_SQL_DB_PATH = Deno.env.get("CS_SQL_DB_PATH") || ":memory:";

if (!CS_USER || !CS_PASSWORD) {
  throw new Error("please set CS_USER and CS_PASSWORD!");
}

const logger = new Logger();

const CS_DB_USER = Deno.env.get("CS_DB_USER");
const CS_DB_PASSWORD = Deno.env.get("CS_DB_PASSWORD");
const CS_DB_HOST = Deno.env.get("CS_DB_HOST");
const CS_DB_NAME = Deno.env.get("CS_DB_NAME");
const CS_DB_PORT = Deno.env.get("CS_DB_PORT");

const storage = new Postgres({
  user: CS_DB_USER,
  database: CS_DB_NAME,
  hostname: CS_DB_HOST,
  password: CS_DB_PASSWORD,
  port: CS_DB_PORT,
});
await storage.init();

export const config = {
  port() {
    return CS_PORT;
  },
  logger() {
    return logger;
  },
  storage() {
    return storage;
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
