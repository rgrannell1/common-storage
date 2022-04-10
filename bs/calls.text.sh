#!/usr/bin/env bash

http --auth="local:$COMMON_STORAGE_LOCAL_PASSWORD" GET "http://localhost:4040/feed"
http --auth="local:$COMMON_STORAGE_LOCAL_PASSWORD" GET "http://localhost:4040/subscription"
http --auth="local:$COMMON_STORAGE_LOCAL_PASSWORD" POST "http://localhost:4040/subscription?topic=photos&hookUrl=http%3A%2F%2Flocalhost%3A8888%2Fnotify"
http --auth="local:$COMMON_STORAGE_LOCAL_PASSWORD" POST "http://localhost:4040/subscription?topic=photos&hookUrl=http%3A%2F%2Flocalhost%3A8888%2Fbroken"
http --auth="local:$COMMON_STORAGE_LOCAL_PASSWORD" GET "http://localhost:4040/topic/photos"
http --auth="local:$COMMON_STORAGE_LOCAL_PASSWORD" POST "http://localhost:4040/topic/photos"

echo '{ "batchId": "wip", "events": [ { "type": "add", "data": { "a": 1 } } ] }' | http --auth="local:$COMMON_STORAGE_LOCAL_PASSWORD" POST "http://localhost:4040/content/photos"
echo '{ "batchId": "wip", "events": [ { "type": "remove", "data": { "a": 2 } } ] }' | http --auth="local:$COMMON_STORAGE_LOCAL_PASSWORD" POST "http://localhost:4040/content/photos"
echo '{ "batchId": "wip", "events": [  ] }' | http --auth="local:$COMMON_STORAGE_LOCAL_PASSWORD" POST "http://localhost:4040/content/photos"

http --auth="local:$COMMON_STORAGE_LOCAL_PASSWORD" GET "http://localhost:4040/content/photos?size=2"
http --auth="local:$COMMON_STORAGE_LOCAL_PASSWORD" GET "http://localhost:4040/content/photos?lastId=1&size=20"
http --auth="local:$COMMON_STORAGE_LOCAL_PASSWORD" POST "http://localhost:4040/notify"
