import type { ILogger, IStorage } from "../../types/index.ts";
import type { Request } from "../../deps.ts";

/**
 * A logger that logs activities and exceptions to the console.
 */
export class ConsoleLogger implements ILogger {
  /**
   * The storage instance used by the logger.
   */
  storage: IStorage;

  /**
   * Creates a new instance of the ConsoleLogger class.
   * @param {IStorage} storage - The storage instance to use.
   */
  constructor(storage: IStorage) {
    this.storage = storage;
  }

  static CSS_INFO = "color: blue";
  static CSS_ERROR = "color: red";

  async info(
    message: string,
    request: Request | undefined,
    data: Record<string, any>,
  ) {
    if (request) {
      const { method, url } = request;
      console.info(
        `%c${method} ${url} | ${message} | data=${JSON.stringify(data)}`,
        ConsoleLogger.CSS_INFO,
      );
    } else {
      console.info(
        `%c${message} | data=${JSON.stringify(data)}`,
        ConsoleLogger.CSS_INFO,
      );
    }
  }

  async error(
    message: string,
    request: Request | undefined,
    data: Record<string, any>,
  ) {
    if (request) {
      const { method, url } = request;
      console.error(
        `%c${method} ${url} | ${message} | data=${JSON.stringify(data)}`,
        ConsoleLogger.CSS_ERROR,
      );
    } else {
      console.error(
        `%c${message} | data=${JSON.stringify(data)}`,
        ConsoleLogger.CSS_ERROR,
      );
    }
  }
}
