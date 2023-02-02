#!/bin/sh
//bin/true; exec /home/rg/.deno/bin/deno run -A "$0" "$@"

function auth(username?: string, password?: string) {
  if (username && password) {
    return `Basic ${btoa(username + ":" + password)}`;
  }

  const USER = Deno.env.get("CS_USER");
  const PASSWORD = Deno.env.get("CS_PASSWORD");

  if (!USER || !PASSWORD) {
    throw new Error("missing user / password");
  }

  const credentials = { user: USER, password: PASSWORD };

  return `Basic ${btoa(credentials.user + ":" + credentials.password)}`;
}

export class API {
  endpoint: string;
  credentials: {username: string, password: string};

  constructor(credentials?: {username: string, password: string}, dev?: boolean) {
    this.endpoint = dev
      ? "http://localhost:8080"
      : "https://mycloud.rgrannell.xyz";

      if (credentials) {
        this.credentials = credentials;
      }
  }

  getFeed() {
    return fetch(`${this.endpoint}/feed`, {
      method: "get",
      headers: new Headers({
        "authorization": auth(this.credentials?.username, this.credentials?.password),
        "content-type": "application/json",
      }),
    });
  }

  getTopic(topic: string) {
    return fetch(`${this.endpoint}/topic/${topic}`, {
      method: "get",
      headers: new Headers({
        "authorization": auth(this.credentials?.username, this.credentials?.password),
        "content-type": "application/json",
      }),
    });
  }

  postTopic(topic: string, description: string) {
    return fetch(`${this.endpoint}/topic/${topic}`, {
      method: "post",
      body: JSON.stringify({
        description,
      }),
      headers: new Headers({
        "authorization": auth(this.credentials?.username, this.credentials?.password),
        "content-type": "application/json",
      }),
    });
  }

  deleteTopic(topic: string) {
    return fetch(`${this.endpoint}/topic/${topic}`, {
      method: "delete",
      headers: new Headers({
        "authorization": auth(this.credentials?.username, this.credentials?.password),
        "content-type": "application/json",
      }),
    });
  }

  getContent(topic: string, startId?: string) {
    const params = typeof startId !== "undefined" ? `?startId=${startId}` : "";

    return fetch(`${this.endpoint}/content/${topic}${params}`, {
      method: "get",
      headers: new Headers({
        "authorization": auth(this.credentials?.username, this.credentials?.password),
        "content-type": "application/json",
      }),
    });
  }

  postContent(topic: string, content: string) {
    return fetch(`${this.endpoint}/content/${topic}`, {
      method: "post",
      headers: new Headers({
        "authorization": auth(this.credentials?.username, this.credentials?.password),
        "content-type": "application/json",
      }),
      body: JSON.stringify({
        content,
      }),
    });
  }

  postSubscription(topic: string, target: string, frequency: number) {
    return fetch(`${this.endpoint}/subscription`, {
      method: "post",
      headers: new Headers({
        "authorization": auth(this.credentials?.username, this.credentials?.password),
        "content-type": "application/json",
      }),
      body: JSON.stringify({
        topic,
        target,
        frequency,
      }),
    });
  }
}
