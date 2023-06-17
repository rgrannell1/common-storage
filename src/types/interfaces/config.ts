import type { ILogger } from "./logger.ts";
import type { IStorage } from "./storage.ts";

/*
 * Common-Storage configuration
 */
export interface IConfig {
  port: number;
  logger: ILogger;
  storage: IStorage;
  title: string;
  description: string;
  users: Record<string, {
    password: string;
  }>;
}
