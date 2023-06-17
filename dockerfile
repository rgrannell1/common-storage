# syntax=docker/dockerfile:1
FROM denoland/deno:1.26.0

WORKDIR /app
VOLUME ["/database"]

COPY src/           /app/src/
COPY users.json     /app/users.json
COPY upstreams.json /app/upstreams.json

ARG CS_TITLE
ARG CS_DESCRIPTION
ARG CS_PORT
ARG CS_SQLITE_DB_PATH
ARG CS_DB_ENGINE
ARG CS_LOGGER

ENV CS_TITLE $CS_TITLE
ENV CS_DESCRIPTION $CS_DESCRIPTION
ENV CS_PORT $CS_PORT
ENV CS_SQLITE_DB_PATH $CS_SQLITE_DB_PATH
ENV CS_DB_ENGINE $CS_DB_ENGINE
ENV CS_LOGGER $CS_LOGGER

CMD [ "deno", "run", "--allow-all", "/app/src/launch.ts" ]
