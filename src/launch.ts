import { CommonStorage } from "./app.ts";
import { config } from "./config.ts";

const server = new CommonStorage(config);
server.launch(true);
