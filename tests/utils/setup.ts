import { CommonStorage } from "../../src/app.ts";
import { IConfig } from "../../src/interfaces/config.ts";
import { IStorage } from "../../src/interfaces/storage.ts";
import { NoOpLogger } from "../../src/logger/logger.ts";
import { Opine } from "https://deno.land/x/opine@2.3.3/mod.ts";
import { config, getStorage } from "../../src/config.ts";

export type TestParams = {
  app: Opine;
  config: IConfig;
};

export type TestCase = (params: TestParams) => Promise<void>;

export class ServerTest {
  name: string;

  constructor(name: string) {
    this.name = name;
  }

  async test(test: TestCase) {
    const srv = new CommonStorage(config);
    const app = await srv.launch(false);

    try {
      await test({ app, config });
    } finally {
      await config.storage().cleanup();
    }
  }
}
