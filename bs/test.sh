#! /usr/bin/env zsh

export $(cat .env | xargs)
deno test -A tests2/*-test.ts
