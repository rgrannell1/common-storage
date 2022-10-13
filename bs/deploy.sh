#! /usr/bin/env zsh

export $(cat .env | grep 'DENO_DEPLOY_TOKEN' | xargs)

deployctl deploy           \
  --project=common-storage \
  --include='src'          \
  src/launch.ts
