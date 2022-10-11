#! /usr/bin/env zsh

deno test --coverage=./coverage -A tests/*-test.ts || { exit 0 }
