#! /usr/bin/env zsh

export $(cat .env | xargs)

deno test \
  --unsafely-ignore-certificate-errors                                  \
  --cert '/home/rg/Code/common-storage/certificates/ca-certificate.crt' \
  --coverage=./coverage                                                 \
  --allow-all                                                           \
  tests/*-test.ts
