// KvEventStore — implements IEventService; delegates to the Events domain module
// @work.md

import type { IStorageBackend } from "./backend.ts";
import type {
  IEventService,
  EventEntry,
  ReadEventOptions,
  UpdateEventTimestamps,
  MerkleDiffRequest,
  MerkleDiffResponse,
  WriteFailure,
} from "../capabilities.ts";
import type { ILocalEventStore } from "../backend.ts";
import type { Result } from "../../commons/types/result.ts";
import * as Events from "./events/index.ts";

export class KvEventStore implements IEventService, ILocalEventStore {
  constructor(private readonly storage: IStorageBackend) {}

  writeEvent(topic: string, payload: unknown): Promise<Result<EventEntry, WriteFailure>> {
    return Events.writeEvent(this.storage, topic, payload);
  }

  deleteEvent(topic: string, id: number): Promise<void> {
    return Events.deleteEvent(this.storage, topic, id);
  }

  readEvents(topic: string, opts: ReadEventOptions): Promise<EventEntry[] | null> {
    return Events.readEvents(this.storage, topic, opts);
  }

  readEvent(topic: string, id: number): Promise<EventEntry | null> {
    return Events.readEvent(this.storage, topic, id);
  }

  updateEvent(
    topic: string,
    id: number,
    payload: unknown,
    timestamps?: UpdateEventTimestamps,
  ): Promise<Result<{ entry: EventEntry; created: boolean }, WriteFailure>> {
    return Events.updateEvent(this.storage, topic, id, payload, timestamps);
  }

  async *streamEvents(
    topic: string,
    startId: number,
    signal: AbortSignal,
  ): AsyncGenerator<EventEntry> {
    yield* Events.streamEvents(this.storage, topic, startId, signal);
  }

  diffEvents(topic: string, req: MerkleDiffRequest): Promise<MerkleDiffResponse | null> {
    return Events.diffEvents(this.storage, topic, req);
  }
}
