#! /usr/bin/env bash

docker rm -f $(docker ps -aq --filter image=cs)
docker rm -f $(docker ps -aq --filter volume=kv_store)
docker volume rm kv_store
