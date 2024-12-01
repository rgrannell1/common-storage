import {
  JSONLinesParseStream,
} from "https://deno.land/x/jsonlines@v1.2.1/js/mod.js";

import { Permission } from "../types/auth.ts";

export type PostUserOpts = {
  role: string;
  password: string;
};

export type PostRoleOpts = {
  permissions: Permission[];
};

export type PostSubscriptionOpts = {
  source: string;
  serviceAccount: string;
  frequency: number;
};

export type PostContentOpts<T> = {
  batchId: string;
  content: T[];
};

export type PostTopicOpts = {
  description: string;
  schema: object;
};

export class CommonStorageClient {
  endpoint: string;
  credentials?: {
    username: string;
    password: string;
  };

  constructor(
    endpoint: string,
    credentials: { username: string; password: string } | undefined = undefined,
  ) {
    this.endpoint = endpoint;
    this.credentials = credentials;
  }

  static new(
    endpoint: string,
    credentials: { username: string; password: string } | undefined = undefined,
  ) {
    return new CommonStorageClient(endpoint, credentials);
  }

  withCredentials(username: string, password: string) {
    return new CommonStorageClient(this.endpoint, { username, password });
  }

  #performApiCall(method: string, route: string, body?: string) {
    return fetch(`${this.endpoint}${route}`, {
      method: method,
      headers: {
        "Authorization": this.credentials
          ? `Basic ${
            btoa(`${this.credentials.username}:${this.credentials.password}`)
          }`
          : "",
        "Content-Type": "application/json",
      },
      body,
    });
  }

  getUser(name: string) {
    return this.#performApiCall("GET", `/user/${name}`);
  }
  getUsers() {
    return this.#performApiCall("GET", `/user`);
  }
  postUser(name: string, opts: PostUserOpts) {
    return this.#performApiCall("POST", `/user/${name}`, JSON.stringify(opts));
  }
  getRole(role: string) {
    return this.#performApiCall("GET", `/role/${role}`);
  }
  postRole(role: string, opts: PostRoleOpts) {
    return this.#performApiCall("POST", `/role/${role}`, JSON.stringify(opts));
  }
  getFeed() {
    return this.#performApiCall("GET", "/feed");
  }
  getSubscription(target: string) {
    return this.#performApiCall("GET", `/subscription/${target}`);
  }
  postSubscription(target: string, opts: PostSubscriptionOpts) {
    return this.#performApiCall(
      "POST",
      `/subscription/${target}`,
      JSON.stringify(opts),
    );
  }
  getContent(topic: string, startId?: number, size?: number) {
    const PAGE_SIZE = 10;

    const path = typeof startId !== "undefined"
      ? `/content/${topic}?startId=${startId}&size=${size ?? PAGE_SIZE}`
      : `/content/${topic}?size=${size ?? PAGE_SIZE}`;

    return this.#performApiCall("GET", path);
  }
  async *getAllContent<T>(topic: string, startId?: number) {
    const route = `/content/${topic}?startId=${startId ?? 0}`;
    const res = await fetch(`${this.endpoint}${route}`, {
      method: "GET",
      headers: {
        "Authorization": this.credentials
          ? `Basic ${
            btoa(`${this.credentials.username}:${this.credentials.password}`)
          }`
          : "",
        "Content-Type": "application/x-ndjson",
      },
    });

    if (res.status !== 200) {
      console.error(JSON.stringify(await res.json()));
      Deno.exit(1);
    }

    const contentStream = res.body!
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new JSONLinesParseStream());

    for await (const elem of contentStream) {
      yield elem;
    }
  }

  postContent<T>(topic: string, opts: PostContentOpts<T>) {
    return this.#performApiCall(
      "POST",
      `/content/${topic}`,
      JSON.stringify(opts),
    );
  }
  getTopic(topic: string) {
    return this.#performApiCall("GET", `/topic/${topic}`);
  }
  postTopic(topic: string, opts: PostTopicOpts) {
    return this.#performApiCall(
      "POST",
      `/topic/${topic}`,
      JSON.stringify(opts),
    );
  }
  deleteTopic(topic: string) {
    return this.#performApiCall("DELETE", `/topic/${topic}`);
  }
}
