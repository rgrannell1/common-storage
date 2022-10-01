# Common-Storage [![Test](https://github.com/rgrannell1/common-storage/actions/workflows/test.yaml/badge.svg)](https://github.com/rgrannell1/common-storage/actions/workflows/test.yaml)

Simple state-synchronisation over a network. Synchronise a collection of things
(e.g photos, bookmarks) from one host to another.

## Usage 

> note: common-storage supports (not requires) [rs](https://github.com/rgrannell1/rs) as a build-system.

Start common-server in a docker-container

```bash
./bs/docker:up
```

Create a topic, to which content can be published.

```bash
curl -X POST --user *** 'localhost:8080/topic/bookmarks' -H 'Content-Type: application/json' --data '{ "description": "bookmarks I want to store" }' 
```

Terraform & ansible deployment are also included in this repository

## Motivation

I'm moving my personal data off of cloud-services into a personal knowledge-hub.
I need simple computer-to-computer data-synchronisation with support for multiple
stores & the ability to run programs when data changes (e.g when a photo is
added back it up to s3 and associate it with my location data based on
timestamp)

## Properties

A server with configurable storage-backends (defaults to SQLite) with the
following properties:

- Append-only: Data is not updated in-place; instead `add` and `remove` events
  are sent to the server. This protects against accidental data-loss while
  allowing for a changing set of 'visible' data over time.

- PubSub: subscribe to data, and a notification will be sent to your server when
  relevant data is updated. This allows you to avoid writing polling code. Can
  also subscribe to a topic to sync over a network.

- Fault-tolerant: if a subscriber is offline, that's fine! Common-Storage will
  notify it intermittently until it succeeds when the node is back online online
  it can fetch any data it does not currently have synced.

- Authenticated: read-write access is restricted by basic-authentication.

## API

Common-Storage has the following routes

| Method | Route               | Description                                         |
| ------ | ------------------- | --------------------------------------------------- |
| GET    | `/feed`             | get topics stats, endpoints published by the server |
| GET    | `/subscription`     | get all subscriptions to the server                 |
| POST   | `/subscription`     | add a subscription                                  |
| GET    | `/subscription/:id` | get subscription data                               |
| POST   | `/subscription/:id` | update subscription                                 |
| DELETE | `/subscription/:id` | delete subscription                                 |
| POST   | `/topic/:name`      | add a topic                                         |
| GET    | `/topic/:name/`     | get a topic description                             |
| GET    | `/content/:name/`   | get content from a topic                            |
| POST   | `/content/:name`    | add content to a topic, as part of a batch          |

The workflow is:

- Create a topic (e.g bookmarks) using `POST /topic/bookmarks`
- Set up subscriptions to this topic using
  `POST /subscription?topic=bookmarks&hookUrl=https://myserver.com/notify?`
- Post some content using `POST /content/bookmarks` under a batch-id (e.g
  '2022-01-01-photos'). Finalise the batch by posting an empty list
- When this content is posted, `https://myserver.com/notify` will receive a
  message that there is new content
- Call `POST /content/bookmarks?lastId=<your-last-id>` and enumerate through new
  results.

## Storage Backends

- In-memory

## License

The MIT License

Copyright (c) 2022 Róisín Grannell

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
