import { ServerTest } from "./utils/setup.ts";
import { storageTests } from "./storage-suite.ts";
import * as ServerSuite from "./server-suite.ts";
import { SupportedDB } from "../src/types/types.ts";

type TestOpts = {
  backends: Set<SupportedDB>;
};

class CommonStorageTests {
  opts: TestOpts;
  constructor(opts: TestOpts) {
    this.opts = opts;
  }

  /*
   *
   */
  async storageTests(suites: ServerTest[]) {
    for (const suite of suites) {
      await storageTests(suite);
    }
  }

  /*
   *
   */
  async serverTests(suites: ServerTest[]) {
    for (const suite of suites) {
      await ServerSuite.contentGetTests(suite);
      await ServerSuite.feedGetTests(suite);
      await ServerSuite.topicGetTests(suite);
      await ServerSuite.feedPostTests(suite);
      await ServerSuite.contentPostTests(suite);
      await ServerSuite.contentGetTests(suite);
      await ServerSuite.feedGetTests(suite);
    }
  }

  /*
   *
   */
  backends() {
    const backends: ServerTest[] = [];

    if (this.opts.backends.has("sqlite")) {
      backends.push(
        new ServerTest({
          CS_DB_ENGINE: "sqlite",
          CS_SQLITE_DB_PATH: ":memory:",
        }),
      );
    }

    if (this.opts.backends.has("postgres")) {
      backends.push(
        new ServerTest({
          CS_DB_ENGINE: "postgres",
        }),
      );
    }

    return backends;
  }

  /*
   *
   */
  async run() {
    await this.storageTests(this.backends());
    await this.serverTests(this.backends());
  }
}

/*
 * Run all our test-cases.
 */
const runner = new CommonStorageTests({
  backends: new Set([
    "sqlite",
  ]),
});

await runner.run();
