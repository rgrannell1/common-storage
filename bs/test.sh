#! /usr/bin/env zsh

export $(cat .env | xargs)
deno test --coverage=./coverage -A tests/*-test.ts || { exit 0 }
deno coverage ./coverage --lcov > /tmp/cs-coverage
genhtml -o ./coverage-html /tmp/cs-coverage
