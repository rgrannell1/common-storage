import { InMemoryStorage } from "./storage/in-memory.ts";

const LOCAL_PASSWORD = Deno.env.get("COMMON_STORAGE_LOCAL_PASSWORD");
if (!LOCAL_PASSWORD || LOCAL_PASSWORD.length < 20) {
  throw new Error("invalid password configured!");
}

export default {
  title: "Common Storage",
  description: "A common-storage node used by my websites",
  storage: new InMemoryStorage(),
  port: 4040,
  user: {
    name: "local",
    password: LOCAL_PASSWORD,
  },
};
