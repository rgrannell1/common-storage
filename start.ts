import { csApp, csServices, startApp } from "./app.ts";

const config = {
  port: Deno.env.get("CS_PORT"),
  title: Deno.env.get("CS_TITLE"),
  description: Deno.env.get("CS_DESCRIPTION"),
  logger: Deno.env.get("CS_LOGGER"),
  adminUsername: Deno.env.get("CS_ADMIN_USERNAME"),
  adminPassword: Deno.env.get("CS_ADMIN_PASSWORD"),
  kvPath: Deno.env.get("CS_KV_PATH"),
};

const services = await csServices(config);
const app = await csApp(config, services);

console.error(`Starting common-storage on port ${config.port}...`);

await startApp(app, config);
