#! /usr/bin/env bash

EXTERNAL_PORT=8080
INTERNAL_PORT=80

ENV_FILE=.env
CONTAINER_NAME=cs

docker build -t "$CONTAINER_NAME" .
docker run -p "$EXTERNAL_PORT:$INTERNAL_PORT" -v kv_store:/app/kv --env-file "$ENV_FILE" -it "$CONTAINER_NAME"
