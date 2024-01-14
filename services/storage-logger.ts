import type {
  Activity,
  IAddActivity,
  IAddException,
  ILogger,
} from "../types.ts";

export class StorageLogger implements ILogger {
  /*
   * Logs activity and exceptions to the storage backend
   */
  storage: IAddActivity & IAddException;

  constructor(storage: IAddActivity & IAddException) {
    this.storage = storage;
  }
  async addActivity(activity: Activity) {
    await this.storage.addActivity({
      ...activity,
    });
  }
  async addException(err: Error): Promise<void> {
    await this.storage.addException(err);
  }
}
