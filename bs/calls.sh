#!/usr/bin/env bash

http --follow GET "http://localhost:4040/.netlify/functions/v1/feed"
http --follow GET "http://localhost:4040/.netlify/functions/v1/subscription"
http --follow POST "http://localhost:4040/.netlify/functions/v1/subscription?topic=photos&hookUrl=http%3A%2F%2Flocalhost%3A8888%2Fnotify"
http --follow POST "http://localhost:4040/.netlify/functions/v1/subscription?topic=photos&hookUrl=http%3A%2F%2Flocalhost%3A8888%2Fbroken"
http --follow GET "http://localhost:4040/.netlify/functions/v1/topic/photos"
http --follow POST "http://localhost:4040/.netlify/functions/v1/topic/photos"

echo '{ "batchId": "wip", "events": [ { "type": "add", "data": { "a": 1 } } ] }' | http --follow POST "http://localhost:4040/.netlify/functions/v1/content/photos"
echo '{ "batchId": "wip", "events": [ { "type": "remove", "data": { "a": 2 } } ] }' | http --follow POST "http://localhost:4040/.netlify/functions/v1/content/photos"
echo '{ "batchId": "wip", "events": [  ] }' | http --follow POST "http://localhost:4040/.netlify/functions/v1/content/photos"

http --follow GET "http://localhost:4040/.netlify/functions/v1/content/photos?size=2"
http --follow GET "http://localhost:4040/.netlify/functions/v1/content/photos?lastId=1&size=20"
http --follow POST "http://localhost:4040/.netlify/functions/v1/notify"
