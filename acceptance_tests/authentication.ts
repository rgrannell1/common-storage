import { assert } from "https://deno.land/std@0.202.0/assert/mod.ts";
import { csApp, csServices, startApp } from "../app.ts";

const port = 8080;
const config = {
  port,
  title: "test-title",
  description: "test-description",
  logger: "console",
  adminUsername: "admin",
  adminPassword: "admin",
};

const services = await csServices(config);
const app = await csApp(config, services);

const appController = await startApp(app, config);

// create role
// create a user
// create a topic
// post some content
// fetch some content

// ++ create a role
const roleCreate = await fetch(`http://localhost:${port}/role/test-role`, {
  method: "POST",
  headers: {
    "Authorization": `Basic ${btoa("admin:admin")}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    permissions: [{
      routes: ["POST /topic", "POST /content", "GET /content"],
      topics: ["notes"],
    }],
  }),
});

assert(roleCreate.status, 200);

// ++ create a user
const userCreate = await fetch(`http://localhost:${port}/user/test-user`, {
  method: "POST",
  headers: {
    "Authorization": `Basic ${btoa("admin:admin")}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    role: "test-role",
    password: "123123123123",
  }),
});

assert(userCreate.status, 200);

// ++ create a topic
const topicCreate = await fetch(`http://localhost:${port}/topic/notes`, {
  method: "POST",
  headers: {
    "Authorization": `Basic ${btoa("test-user:123123123123")}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    role: "test-role",
    password: "123123123123",
  }),
});

assert(userCreate.status, 200);

appController.abort();
