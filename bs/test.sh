#! /usr/bin/env bash

deno test \
  --coverage=./coverage \
  --unstable            \
  --allow-all           \
  --trace-ops
