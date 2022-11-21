#! /usr/bin/env zsh

export $(cat .env | xargs)

docker-compose build
