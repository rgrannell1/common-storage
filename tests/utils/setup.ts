import { CommonStorage } from "../../src/app.ts";
import { IConfig } from "../../src/interfaces/config.ts";
import { Opine } from "https://deno.land/x/opine@2.3.3/mod.ts";
import { bindings, config } from "../../src/config.ts";

export type TestParams = {
  app: Opine;
  config: IConfig;
};

export type TestCase = (params: TestParams) => Promise<void>;

export class ServerTest {
  bindings: Record<string, any>;

  constructor(overrides: Record<string, any>) {
    this.bindings = bindings(overrides);
  }

  async test(test: TestCase) {
    const cfg = config(this.bindings)

    const store = cfg.storage;
    await store.init();
    const app = await (new CommonStorage(cfg))
      .launch(false);

    try {
      await test({ app, config: cfg });
    } finally {
      await store.cleanup();
    }
  }
}
