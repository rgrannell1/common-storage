#! /usr/bin/env bash

COVERAGE_DIR=/tmp/cs-coverage

deno coverage ./coverage --lcov > "$COVERAGE_DIR"
genhtml -o ./coverage-html "$COVERAGE_DIR"
open ./coverage-html/index.html
