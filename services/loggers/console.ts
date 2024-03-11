import type { Activity, ILogger, IStorage } from "../../types/index.ts";
import type { Request } from "https://deno.land/x/oak@v12.6.2/mod.ts";

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

  async info(message: string, request: Request | undefined, data: Record<string, any>) {

    if (request) {
      const { method, url } = request;
      console.info(`${method} ${url} | ${message} | data=${JSON.stringify(data)}`);
    } else {
      console.info(`${message} | data=${JSON.stringify(data)}`);
    }
  }

  async error(message: string, request: Request | undefined, data: Record<string, any>) {
    if (request) {
      const { method, url } = request;
      console.error(`${method} ${url} | ${message} | data=${JSON.stringify(data)}`);
    } else {
      console.error(`${message} | data=${JSON.stringify(data)}`);
    }
  }


  /**
   * Logs an activity to the console.
   * @param {Activity} activity - The activity to log.
   */
  async addActivity(activity: Activity) {
    const { message, request, metadata } = activity;
    const { method, url } = request;
    const id = (request as any)?.state?.id;

    console.info(
      `${method} ${url} | ${message} | metadata=${JSON.stringify({id, ...metadata})}`,
    );
  }

  /**
   * Logs an exception to the console.
   * @param {Error} err - The exception to log.
   */
  async addException(err: Error): Promise<void> {
    console.error(`an error occurred: ${err.message}\n${err.stack}`);
  }
}
