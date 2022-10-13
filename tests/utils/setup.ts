import { CommonStorage } from "../../src/app.ts";
import { IConfig } from "../../src/interfaces/config.ts";
import { Opine } from "https://deno.land/x/opine@2.3.3/mod.ts";
import { config } from "../../src/config.ts";

export type TestParams = {
  app: Opine;
  config: IConfig;
};

export type TestCase = (params: TestParams) => Promise<void>;

export class ServerTest {
  name: string;

  constructor(name: string) {
    Deno.env.set("CS_DB_ENGINE", name);
    this.name = name;
  }

  async test(test: TestCase) {
    const store = config.storage();
    await store.init();
    const app = await (new CommonStorage(config))
      .launch(false);

    try {
      await test({ app, config });
    } finally {
      await store.cleanup();
    }
  }
}
