import { csApp, csServices, startApp } from "./app.ts";

const config = {
  port: Deno.env.get("CS_PORT"),
  title: Deno.env.get("CS_TITLE"),
  description: Deno.env.get("CS_DESCRIPTION"),
  logger: Deno.env.get("CS_LOGGER"),
  adminUsername: Deno.env.get("CS_ADMIN_USERNAME"),
  adminPassword: Deno.env.get("CS_ADMIN_PASSWORD"),
};

const services = await csServices(config);
const app = await csApp(config, services);

await startApp(app, config);
