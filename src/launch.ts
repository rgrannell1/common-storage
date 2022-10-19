import { CommonStorage } from "./app.ts";
import { bindings, config } from "./config.ts";

const cfg = config(bindings({}));

const server = new CommonStorage(cfg);
await server.launch(true);
