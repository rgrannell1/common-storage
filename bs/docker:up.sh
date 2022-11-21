#! /usr/bin/env zsh

export $(cat .env | xargs)

rs docker:build
docker-compose up
