#! /usr/bin/env zsh

deployctl deploy           \
  --project=common-storage \
  --include='src'          \
  src/launch.ts
