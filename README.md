# Common-Storage

Simple state-syncronisation over a network. Syncronise a collection of things
(e.g photos, bookmarks) from one host to another.

## Motivation

I'm moving my personal data off of cloud-services into a personal knowledge-hub.
I need simple computer-to-computer data-syncronisation with support for multiple
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
  notify it according to its `Retry-After` header, and when the node is back
  online it can fetch any data it does not currently have synced.

- Authenticated: read-write access is restricted by basic authentication.

## Usage

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
