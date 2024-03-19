import { csApp, csServices, startApp } from "./app.ts";
import { CommonStorageConfig } from "./services/config.ts";

const config = CommonStorageConfig.read();

const services = await csServices(config);
const appData = await csApp(config, services);

console.error(`Starting common-storage on port ${config.port}...`);

const controller = await startApp(appData, services, config);

Deno.addSignalListener("SIGINT", async () => {
  controller.abort();
});
