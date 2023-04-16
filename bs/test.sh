#! /usr/bin/env zsh

export $(cat .env | xargs)

deno test \
  --coverage=./coverage                                                 \
  --allow-all                                                           \
  --trace-ops                                                           \
  tests/*-test.ts
