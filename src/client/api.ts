#!/bin/sh
//bin/true; exec /home/rg/.deno/bin/deno run -A "$0" "$@"

const endpoint = "https://mycloud.rgrannell.xyz";

function auth() {
  const USER = Deno.env.get("CS_USER");
  const PASSWORD = Deno.env.get("CS_PASSWORD");

  if (!USER || !PASSWORD) {
    throw new Error("missing user / password");
  }

  const credentials = { user: USER, password: PASSWORD };

  return `Basic ${btoa(credentials.user + ":" + credentials.password)}`;
}

export function getFeed() {
  return fetch(`${endpoint}/feed`, {
    method: "get",
    headers: new Headers({
      "authorization": auth(),
      "content-type": "application/json",
    }),
  });
}

export function getTopic(topic: string) {
  return fetch(`${endpoint}/topic/${topic}`, {
    method: "get",
    headers: new Headers({
      "authorization": auth(),
      "content-type": "application/json",
    }),
  });
}

export function postTopic(topic: string, description: string) {
  return fetch(`${endpoint}/topic/${topic}`, {
    method: "post",
    body: JSON.stringify({
      description,
    }),
    headers: new Headers({
      "authorization": auth(),
      "content-type": "application/json",
    }),
  });
}

export function deleteTopic(topic: string) {
  return fetch(`${endpoint}/topic/${topic}`, {
    method: "delete",
    headers: new Headers({
      "authorization": auth(),
      "content-type": "application/json",
    }),
  });
}

export function getContent(topic: string) {
  return fetch(`${endpoint}/content/${topic}`, {
    method: "get",
    headers: new Headers({
      "authorization": auth(),
      "content-type": "application/json",
    }),
  });
}

export function postContent(topic: string, content: string) {
  return fetch(`${endpoint}/content/${topic}`, {
    method: "post",
    headers: new Headers({
      "authorization": auth(),
      "content-type": "application/json",
    }),
    body: JSON.stringify({
      content,
    }),
  });
}
