#! /usr/bin/env zsh

export $(cat .env | xargs)

deno test \
  --unsafely-ignore-certificate-errors                                  \
  --coverage=./coverage                                                 \
  --allow-all                                                           \
  --trace-ops                                                           \
  tests/*-test.ts
