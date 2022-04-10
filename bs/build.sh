#!/usr/bin/env bash

set -e

for file in "content" "feed" "notify" "subscription" "subscriptions" "topic" "v1"
do
  deno bundle "api/$file.ts"    | npx rollup --format cjs > "dist/$file.js"
done
