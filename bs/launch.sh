#! /usr/bin/env zsh

export $(cat .env | xargs)
deno run -A --cert '/home/rg/Code/common-storage/certificates/ca-certificate.pem' 'src/launch.ts'
