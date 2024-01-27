FROM denoland/deno:alpine

EXPOSE 80

ARG CS_PORT
ARG CS_TITLE
ARG CS_DESCRIPTION
ARG CS_LOGGER
ARG CS_ADMIN_USERNAME
ARG CS_ADMIN_PASSWORD
ARG CS_KV_PATH

VOLUME /app/kv

COPY api         /app/api
COPY services    /app/services
COPY shared      /app/shared
COPY types       /app/types
COPY app.ts      /app/app.ts
COPY start.ts    /app/start.ts
COPY deno.json   /app/deno.json
COPY schema.json /app/schema.json

CMD ["deno", "run", "-A", "--unstable-kv", "/app/start.ts"]
