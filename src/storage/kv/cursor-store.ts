// KvCursorStore — persists last-seen sync position per topic in Deno KV.

import type { IStorageBackend } from "./backend.ts";
import type { ICursorStore } from "../backend.ts";
import { KV_SYNC_CURSOR } from "./keys.ts";

export class KvCursorStore implements ICursorStore {
  constructor(private readonly storage: IStorageBackend) {}

  async getEventCursor(topic: string): Promise<number> {
    return (await this.storage.get<number>([...KV_SYNC_CURSOR, "event", topic])) ?? 0;
  }

  setEventCursor(topic: string, id: number): Promise<void> {
    return this.storage.set([...KV_SYNC_CURSOR, "event", topic], id);
  }

  async getObjectCursor(topic: string): Promise<number> {
    return (await this.storage.get<number>([...KV_SYNC_CURSOR, "object", topic])) ?? 0;
  }

  setObjectCursor(topic: string, seq: number): Promise<void> {
    return this.storage.set([...KV_SYNC_CURSOR, "object", topic], seq);
  }
}
