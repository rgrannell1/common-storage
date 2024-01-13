import type { Activity, ILogger, IStorage } from "../types.ts";

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

  /**
   * Logs an activity to the console.
   * @param {Activity} activity - The activity to log.
   */
  async addActivity(activity: Activity) {
    const { message, request, metadata } = activity;
    const { method, url } = request;

    console.error(`${method} ${url} | ${message} | metadata=${JSON.stringify(metadata)}`);
  }

  /**
   * Logs an exception to the console.
   * @param {Error} err - The exception to log.
   */
  async addException(err: Error): Promise<void> {
    console.error(`an error occurred: ${err.message}\n${err.stack}`);
  }
}
