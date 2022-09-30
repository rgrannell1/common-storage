import type { ILogger } from "../interfaces/logger.ts";

export class Logger implements ILogger {
  info(message: string, obj?: Record<string, any>) {
    console.log(`📦 Common-Storage | ${message}`);
    if (obj) {
      console.log(JSON.stringify(obj));
    }
  }
}
