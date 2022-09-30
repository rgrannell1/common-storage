import { Logger } from "../src/logger/logger.ts";
import { Sqlite } from "../src/storage/sqlite/sqlite.ts";

const CS_PORT = parseInt(Deno.env.get("CS_PORT") || "8080");
const CS_TITLE = Deno.env.get("CS_TITLE") || "common-storage";
const CS_DESCRIPTION = Deno.env.get("CS_DESCRIPTION") || "common-storage";
const CS_USER = Deno.env.get("CS_USER");
const CS_PASSWORD = Deno.env.get("CS_PASSWORD");
const CS_SQL_DB_PATH = Deno.env.get("CS_SQL_DB_PATH") || ":memory:";

if (!CS_USER || !CS_PASSWORD) {
  throw new Error("please set CS_USER and CS_PASSWORD!");
}

console.log([
  CS_TITLE,
  CS_DESCRIPTION,
]);

const logger = new Logger();

const storage = new Sqlite(CS_SQL_DB_PATH);
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
