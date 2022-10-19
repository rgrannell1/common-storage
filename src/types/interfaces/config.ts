import type { ILogger } from "./logger.ts";
import type { IStorage } from "./storage.ts";

export interface IConfig {
  port: number;
  logger: ILogger;
  storage: IStorage;
  title: string;
  description: string;
  user: { name: string; password: string };
}
