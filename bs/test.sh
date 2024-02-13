#! /usr/bin/env bash

deno test \
  --unstable-kv         \
  --allow-all           \
  --trace-ops
