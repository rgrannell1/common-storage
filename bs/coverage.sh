#! /usr/bin/env zsh

./bs/test.sh

deno coverage ./coverage --lcov > /tmp/cs-coverage
genhtml -o ./coverage-html /tmp/cs-coverage
