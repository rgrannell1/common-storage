#! /usr/bin/env bash

rm /tmp/local-server
rm /tmp/remote-server
deno run -A --unstable-kv integration-tests/standard-usage.ts
