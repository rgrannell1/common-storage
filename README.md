
# Common-Storage

Simple state-syncronisation over a network. Syncronise a collection of things (e.g photos, bookmarks) from one host to another.

## Motivation

I'm moving my personal data off of cloud-services into a personal knowledge-hub. I need simple computer-to-computer data-syncronisation with support for multiple stores & the ability to run programs when data changes (e.g when a photo is added back it up to s3 and associate it with my location data based on timestamp) 

## Properties

A server with configurable storage-backends (defaults to SQLite) with the following properties:

- Append-only: Data is not updated in-place; instead `add` and `remove` events are sent to the server. This protects against accidental data-loss while allowing for a changing set of 'visible' data over time.

- PubSub: subscribe to data, and a notification will be sent to your server when relevant data is updated. This allows you to avoid writing polling code. Can also subscribe to a topic to sync over a network.

- Fault-tolerant: if a subscriber is offline, that's fine! Common-Storage will notify it according to its `Retry-After` header, and when the node is back online it can fetch any data it does not currently have synced.

- Authenticated: read-write access is restricted by basic authentication.
