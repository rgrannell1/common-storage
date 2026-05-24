// KvObjectStore — implements IObjectService; delegates to the Objects domain module
// @work.md

import type { IStorageBackend } from "../backend.ts";
import type { IObjectService, ObjectEntry, ObjectDiffRequest, ObjectDiffResult } from "../capabilities.ts";
import * as Objects from "./objects.ts";

export class KvObjectStore implements IObjectService {
  constructor(private readonly storage: IStorageBackend) {}

  upsertObject(topic: string, id: string, payload: unknown): Promise<ObjectEntry | null> {
    return Objects.upsertObject(this.storage, topic, id, payload);
  }

  readObject(topic: string, id: string): Promise<ObjectEntry | null> {
    return Objects.readObject(this.storage, topic, id);
  }

  deleteObject(topic: string, id: string): Promise<ObjectEntry | null> {
    return Objects.deleteObject(this.storage, topic, id);
  }

  readObjects(topic: string): Promise<ObjectEntry[] | null> {
    return Objects.readObjects(this.storage, topic);
  }

  readObjectsBySeq(topic: string, opts: { start?: number; size?: number }): Promise<ObjectEntry[] | null> {
    return Objects.readObjectsBySeq(this.storage, topic, opts);
  }

  async *streamObjects(topic: string, startSeq: number, signal: AbortSignal): AsyncGenerator<ObjectEntry> {
    yield* Objects.streamObjects(this.storage, topic, startSeq, signal);
  }

  diffObjects(topic: string, req: ObjectDiffRequest): Promise<ObjectDiffResult | null> {
    return Objects.diffObjects(this.storage, topic, req);
  }

  sweepTombstones(topic: string, cutoff?: number): Promise<void> {
    return Objects.sweepTombstones(this.storage, topic, cutoff);
  }
}
