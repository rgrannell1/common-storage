FROM denoland/deno:alpine

EXPOSE 80

ARG CS_PORT
ARG CS_TITLE
ARG CS_DESCRIPTION
ARG CS_LOGGER
ARG CS_ADMIN_USERNAME
ARG CS_ADMIN_PASSWORD
ARG CS_KV_PATH

RUN mkdir -p /app/database
VOLUME /app/database

COPY api         /app/api
COPY services    /app/services
COPY shared      /app/shared
COPY types       /app/types
COPY app.ts      /app/app.ts
COPY start.ts    /app/start.ts
COPY deno.json   /app/deno.json

RUN chown -R deno:deno /app
USER deno

CMD ["deno", "run", "-A", "--unstable-kv", "/app/start.ts"]
