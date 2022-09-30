import { Logger } from "../../src/logger/logger.ts";
import { Sqlite } from "../../src/storage/sqlite/sqlite.ts";

export async function commonConfig() {
  const storage = new Sqlite(":memory:");
  await storage.init();

  return {
    port() {
      return 8080;
    },
    logger() {
      return new Logger();
    },
    storage() {
      return storage;
    },
    title() {
      return "common-storage";
    },
    description() {
      return "a test server";
    },
    user() {
      return {
        name: "bob",
        password: "bob",
      };
    },
  };
}
