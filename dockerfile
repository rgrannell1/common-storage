# syntax=docker/dockerfile:1
FROM denoland/deno:1.26.0

WORKDIR /app
VOLUME ["/database"]

COPY src/ /app/src/

ARG CS_TITLE
ARG CS_USER
ARG CS_DESCRIPTION
ARG CS_PASSWORD
ARG CS_PORT
ARG CS_SQLITE_DB_PATH
ARG CS_DB_ENGINE
ARG CS_LOGGER

ENV CS_TITLE $CS_TITLE
ENV CS_USER $CS_USER
ENV CS_DESCRIPTION $CS_DESCRIPTION
ENV CS_PASSWORD $CS_PASSWORD
ENV CS_PORT $CS_PORT
ENV CS_SQLITE_DB_PATH $CS_SQLITE_DB_PATH
ENV CS_DB_ENGINE $CS_DB_ENGINE
ENV CS_LOGGER $CS_LOGGER

RUN apt-get update && add-apt-repository ppa:certbot/certbot && apt-get update && apt-get install certbot


CMD [ "deno", "run", "--allow-all", "/app/src/launch.ts" ]
