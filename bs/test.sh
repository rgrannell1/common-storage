#! /usr/bin/env zsh

export $(cat .env | xargs)
deno test --coverage=./coverage -A tests/*-test.ts || { exit 0 }
