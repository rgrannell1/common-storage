// KvIdempotencyStore — implements IIdempotencyService; delegates to the Idempotency domain module
// @work.md

import type { IStorageBackend } from "./backend.ts";
import type { IIdempotencyService } from "../capabilities.ts";
import * as Idempotency from "./idempotency.ts";

export class KvIdempotencyStore implements IIdempotencyService {
  constructor(private readonly storage: IStorageBackend) {}

  readIdempotencyEntry(namespace: string, topic: string, key: string): Promise<unknown | null> {
    return Idempotency.readIdempotencyEntry(this.storage, namespace, topic, key);
  }

  writeIdempotencyEntry(namespace: string, topic: string, key: string, entry: unknown): Promise<void> {
    return Idempotency.writeIdempotencyEntry(this.storage, namespace, topic, key, entry);
  }
}
