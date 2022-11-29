import type { ILogger } from ".././types/interfaces/logger.ts";

export class JsonLogger implements ILogger {
  info(message: string, obj?: Record<string, any>) {
    console.log(`📦 Common-Storage | ${message}`);
    if (obj) {
      console.log(JSON.stringify(obj));
    }
  }
  error(message: string, obj?: Record<string, any>) {
    console.error(`📦 Common-Storage | ${message}`);
    if (obj) {
      console.error(JSON.stringify(obj));
    }
  }
}
