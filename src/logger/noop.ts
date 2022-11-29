import type { ILogger } from ".././types/interfaces/logger.ts";

export class NoOpLogger implements ILogger {
  info(_message: string, _obj?: Record<string, any>) {}
  error(_message: string, _obj?: Record<string, any>) {}
}
