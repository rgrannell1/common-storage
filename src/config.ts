import { InMemoryStorage } from "./storage/in-memory.ts";

export default {
  title: "Common Storage",
  description: "Yo!",
  storage: new InMemoryStorage(),
  port: 8080,
};
