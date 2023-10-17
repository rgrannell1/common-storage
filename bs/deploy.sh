#! /usr/bin/env bash

rm -rf coverage || yes

deployctl deploy --project='common-storage' start.ts --prod
