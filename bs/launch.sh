#! /usr/bin/env zsh

export $(cat .env | xargs)
deno run --unsafely-ignore-certificate-errors -A --cert '/home/rg/Code/common-storage/certificates/ca-certificate.crt' 'src/launch.ts'
