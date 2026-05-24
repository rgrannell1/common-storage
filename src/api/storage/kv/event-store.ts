// KvEventStore — implements IEventService; delegates to the Events domain module
// @work.md

import type { IStorageBackend } from "../backend.ts";
import type { IEventService, EventEntry, ReadEventOptions, UpdateEventTimestamps, EventDiffRequest, EventDiffResult } from "../capabilities.ts";
import * as Events from "./events/index.ts";

export class KvEventStore implements IEventService {
  constructor(private readonly storage: IStorageBackend) {}

  writeEvent(topic: string, payload: unknown): Promise<EventEntry | null> {
    return Events.writeEvent(this.storage, topic, payload);
  }

  readEvents(topic: string, opts: ReadEventOptions): Promise<EventEntry[] | null> {
    return Events.readEvents(this.storage, topic, opts);
  }

  readEvent(topic: string, id: number): Promise<EventEntry | null> {
    return Events.readEvent(this.storage, topic, id);
  }

  updateEvent(topic: string, id: number, payload: unknown, timestamps?: UpdateEventTimestamps): Promise<{ entry: EventEntry; created: boolean } | null> {
    return Events.updateEvent(this.storage, topic, id, payload, timestamps);
  }

  async *streamEvents(topic: string, startId: number, signal: AbortSignal): AsyncGenerator<EventEntry> {
    yield* Events.streamEvents(this.storage, topic, startId, signal);
  }

  diffEvents(topic: string, req: EventDiffRequest): Promise<EventDiffResult | null> {
    return Events.diffEvents(this.storage, topic, req);
  }
}
