#! /usr/bin/env zsh

source '.env'
deno test -A tests/*-test.ts
