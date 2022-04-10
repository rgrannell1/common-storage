#!/usr/bin/env bash

http GET "http://localhost:4040/feed"
http GET "http://localhost:4040/subscription"
http POST "http://localhost:4040/subscription?topic=photos&hookUrl=http%3A%2F%2Flocalhost%3A8888%2Fnotify"
http POST "http://localhost:4040/subscription?topic=photos&hookUrl=http%3A%2F%2Flocalhost%3A8888%2Fbroken"
http GET "http://localhost:4040/topic/photos"
http POST "http://localhost:4040/topic/photos"

echo '{ "batchId": "wip", "events": [ { "type": "add", "data": { "a": 1 } } ] }' | http POST "http://localhost:4040/content/photos"
echo '{ "batchId": "wip", "events": [ { "type": "remove", "data": { "a": 2 } } ] }' | http POST "http://localhost:4040/content/photos"
echo '{ "batchId": "wip", "events": [  ] }' | http POST "http://localhost:4040/content/photos"

http GET "http://localhost:4040/content/photos?size=2"
http GET "http://localhost:4040/content/photos?lastId=1&size=20"
http POST "http://localhost:4040/notify"
