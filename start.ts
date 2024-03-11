import { csApp, csServices, startApp } from "./app.ts";

const port = parseInt(Deno.env.get("CS_PORT") ?? "8080", 10);

const config = {
  port,
  title: Deno.env.get("CS_TITLE")!,
  description: Deno.env.get("CS_DESCRIPTION")!,
  logger: Deno.env.get("CS_LOGGER")!,
  adminUsername: Deno.env.get("CS_ADMIN_USERNAME")!,
  adminPassword: Deno.env.get("CS_ADMIN_PASSWORD")!,
  kvPath: Deno.env.get("CS_KV_PATH")!,
};

const services = await csServices(config);
const appData = await csApp(config, services);

console.error(`Starting common-storage on port ${config.port}...`);

const controller = await startApp(appData, services, config);

Deno.addSignalListener("SIGINT", async () => {
  controller.abort();
});
