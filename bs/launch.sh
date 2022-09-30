#! /usr/bin/env zsh

export CS_PORT='8080'
export CS_TITLE='common-storage'
export CS_DESCRIPTION='common-storage'
export CS_USER='bob'
export CS_PASSWORD='bob'
export CS_SQL_DB_PATH=':memory:'

deno run -A src/launch.ts
