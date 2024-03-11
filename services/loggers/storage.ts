import type { Activity, ILogger, Request } from "../../types/index.ts";

export class StorageLogger implements ILogger {
  /*
   * Logs activity and exceptions to the storage backend
   */
  storage: {};

  constructor(storage: {}) {
    this.storage = storage;
  }

  async info(
    message: string,
    request: Request | undefined,
    data: Record<string, any>,
  ) {
    return;
  }

  async error(
    message: string,
    request: Request | undefined,
    data: Record<string, any>,
  ) {
    return;
  }
}
