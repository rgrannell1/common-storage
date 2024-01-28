#! /usr/bin/env bash

deployctl deploy --exclude coverage,.env --project common-storage start.ts --prod
