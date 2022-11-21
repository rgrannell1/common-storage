#! /usr/bin/env zsh

export $(cat .env | xargs)
deno run --allow-all 'src/launch.ts'
