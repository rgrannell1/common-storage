// CmstrClient — typed HTTP client for the cmstr API
// @work.md

import { CmstrError } from "./error.ts";
import type {
  CmstrClientConfig,
  FeedResponse,
  EventsResponse,
  EventEntry,
  ObjectEntry,
  GetEventsInput,
  GetEventInput,
  PostEventInput,
  PutEventInput,
  GetObjectsInput,
  GetObjectInput,
  PutObjectInput,
  DeleteObjectInput,
  StreamEventsInput,
} from "./types.ts";

export { CmstrError } from "./error.ts";
export type {
  CmstrClientConfig,
  FeedResponse,
  EventsResponse,
  EventEntry,
  ObjectEntry,
  TopicSummary,
  SubscriptionSummary,
  GetEventsInput,
  GetEventInput,
  PostEventInput,
  PutEventInput,
  GetObjectsInput,
  GetObjectInput,
  PutObjectInput,
  DeleteObjectInput,
  StreamEventsInput,
} from "./types.ts";

type RequestOptions = {
  query?: Record<string, string | undefined>;
  body?: unknown;
  idempotencyKey?: string;
};

export class CmstrClient {
  private readonly url: string;
  private readonly token: string;

  constructor(config: CmstrClientConfig) {
    this.url = config.url.replace(/\/$/, "");
    this.token = config.token;
  }

  private async request(method: string, path: string, options?: RequestOptions): Promise<unknown> {
    const fullUrl = new URL(`${this.url}${path}`);

    if (options?.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined) fullUrl.searchParams.set(key, value);
      }
    }

    const serialisedBody = options?.body !== undefined ? JSON.stringify(options.body) : undefined;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/json",
    };

    if (serialisedBody !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    if (options?.idempotencyKey !== undefined) {
      headers["Idempotency-Key"] = options.idempotencyKey;
    }

    const response = await fetch(fullUrl, {
      method,
      headers,
      body: serialisedBody,
    });

    if (response.status === 204) return null;

    const responseBody = await response.json();
    if (!response.ok) throw new CmstrError(response.status, responseBody);

    return responseBody;
  }

  async getFeed(): Promise<FeedResponse> {
    return await this.request("GET", "/feed") as FeedResponse;
  }

  async getEvents(input: GetEventsInput): Promise<EventsResponse> {
    const query: Record<string, string | undefined> = {
      start: input.start?.toString(),
      size: input.size?.toString(),
      ids: input.ids?.join(","),
      filter: input.filter,
    };
    return await this.request("GET", `/events/${encodeURIComponent(input.topic)}`, { query }) as EventsResponse;
  }

  async getEvent(input: GetEventInput): Promise<EventEntry> {
    return await this.request("GET", `/events/${encodeURIComponent(input.topic)}/${input.id}`) as EventEntry;
  }

  async postEvent(input: PostEventInput): Promise<EventEntry> {
    return await this.request("POST", `/events/${encodeURIComponent(input.topic)}`, {
      body: { payload: input.payload },
      idempotencyKey: input.idempotencyKey,
    }) as EventEntry;
  }

  async putEvent(input: PutEventInput): Promise<EventEntry> {
    return await this.request("PUT", `/events/${encodeURIComponent(input.topic)}/${input.id}`, {
      body: { payload: input.payload },
      idempotencyKey: input.idempotencyKey,
    }) as EventEntry;
  }

  async getObjects(input: GetObjectsInput): Promise<ObjectEntry[]> {
    const query: Record<string, string | undefined> = { filter: input.filter };
    return await this.request("GET", `/objects/${encodeURIComponent(input.topic)}`, { query }) as ObjectEntry[];
  }

  async getObject(input: GetObjectInput): Promise<ObjectEntry> {
    return await this.request("GET", `/objects/${encodeURIComponent(input.topic)}/${encodeURIComponent(input.id)}`) as ObjectEntry;
  }

  async putObject(input: PutObjectInput): Promise<ObjectEntry> {
    return await this.request("PUT", `/objects/${encodeURIComponent(input.topic)}/${encodeURIComponent(input.id)}`, {
      body: { payload: input.payload },
      idempotencyKey: input.idempotencyKey,
    }) as ObjectEntry;
  }

  async deleteObject(input: DeleteObjectInput): Promise<ObjectEntry> {
    return await this.request("DELETE", `/objects/${encodeURIComponent(input.topic)}/${encodeURIComponent(input.id)}`) as ObjectEntry;
  }

  async *streamEvents(input: StreamEventsInput): AsyncGenerator<EventEntry> {
    const url = new URL(`${this.url}/events/${encodeURIComponent(input.topic)}`);
    if (input.start !== undefined) url.searchParams.set("start", input.start.toString());

    const response = await fetch(url, {
      signal: input.signal,
      headers: { Authorization: `Bearer ${this.token}`, Accept: "application/x-ndjson" },
    });

    if (!response.ok || !response.body) throw new CmstrError(response.status, await response.json());

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let remainder = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = remainder + value;
        const lines = chunk.split("\n");
        remainder = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) yield JSON.parse(trimmed) as EventEntry;
        }
      }
      if (remainder.trim()) yield JSON.parse(remainder.trim()) as EventEntry;
    } finally {
      reader.cancel().catch(() => {});
    }
  }
}
