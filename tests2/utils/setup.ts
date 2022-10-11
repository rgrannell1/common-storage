import { CommonStorage } from "../../src/app.ts";
import { IConfig } from "../../src/interfaces/config.ts";
import { IStorage } from "../../src/interfaces/storage.ts";
import { Logger } from "../../src/logger/logger.ts";
import { Sqlite } from "../../src/storage/sqlite/sqlite.ts";
import { Opine } from "https://deno.land/x/opine@2.3.3/mod.ts";

export type TestParams = {
  app: Opine;
  storage: IStorage;
  config: IConfig;
};

export type TestCase = (params: TestParams) => Promise<void>;

export class Servers {
  static new(name: string) {
    if (name === "sqlite") {
      return Servers.sqlite;
    }

    throw new Error("not supported");
  }
  static sqlite(): [Opine, IStorage, IConfig] {
    const storage: IStorage = new Sqlite(":memory:");

    const config: IConfig = {
      port: () => 8080,
      logger: () => new Logger(),
      storage: () => storage,
      title: () => "common-storage testing",
      description: () => "a test server",
      user: () => ({
        name: "bob",
        password: "bob",
      }),
    };

    const server = new CommonStorage(config);
    const app = server.launch(false);

    return [app, storage, config];
  }
}

export class ServerTest {
  name: string;

  constructor(name: string) {
    this.name = name;
  }
  server() {
    if (this.name === "sqlite") {
      return Servers.sqlite();
    }

    throw new Error(`unsupported server-configuration "${this.name}"`);
  }

  async test(test: TestCase) {
    const [app, storage, config] = this.server();

    try {
      await storage.init();
      await test({ app, storage, config });
    } finally {
      //await storage.close();
    }
  }
}
