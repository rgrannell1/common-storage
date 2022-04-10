#!/usr/bin/env bash

http --auth="local:$COMMON_STORAGE_LOCAL_PASSWORD" GET "$COMMON_STORAGE_DOMAIN/feed"
http --auth="local:$COMMON_STORAGE_LOCAL_PASSWORD" GET "$COMMON_STORAGE_DOMAIN/subscription"
http --auth="local:$COMMON_STORAGE_LOCAL_PASSWORD" POST "$COMMON_STORAGE_DOMAIN/subscription?topic=photos&hookUrl=http%3A%2F%2Flocalhost%3A8888%2Fnotify"
http --auth="local:$COMMON_STORAGE_LOCAL_PASSWORD" POST "$COMMON_STORAGE_DOMAIN/subscription?topic=photos&hookUrl=http%3A%2F%2Flocalhost%3A8888%2Fbroken"
http --auth="local:$COMMON_STORAGE_LOCAL_PASSWORD" GET "$COMMON_STORAGE_DOMAIN/topic/photos"
http --auth="local:$COMMON_STORAGE_LOCAL_PASSWORD" POST "$COMMON_STORAGE_DOMAIN/topic/photos"

echo '{ "batchId": "wip", "events": [ { "type": "add", "data": { "a": 1 } } ] }' | http --auth="local:$COMMON_STORAGE_LOCAL_PASSWORD" POST "$COMMON_STORAGE_DOMAIN/content/photos"
echo '{ "batchId": "wip", "events": [ { "type": "remove", "data": { "a": 2 } } ] }' | http --auth="local:$COMMON_STORAGE_LOCAL_PASSWORD" POST "$COMMON_STORAGE_DOMAIN/content/photos"
echo '{ "batchId": "wip", "events": [  ] }' | http --auth="local:$COMMON_STORAGE_LOCAL_PASSWORD" POST "$COMMON_STORAGE_DOMAIN/content/photos"

http --auth="local:$COMMON_STORAGE_LOCAL_PASSWORD" GET "$COMMON_STORAGE_DOMAIN/content/photos?size=2"
http --auth="local:$COMMON_STORAGE_LOCAL_PASSWORD" GET "$COMMON_STORAGE_DOMAIN/content/photos?lastId=1&size=20"
http --auth="local:$COMMON_STORAGE_LOCAL_PASSWORD" POST "$COMMON_STORAGE_DOMAIN/notify"
