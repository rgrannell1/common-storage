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

COPY deps.ts       /app/deps.ts
COPY dev_deps.ts   /app/dev_deps.ts
RUN deno cache     /app/deps.ts

COPY api           /app/api
COPY services      /app/services
COPY shared        /app/shared
COPY types         /app/types
COPY app.ts        /app/app.ts
COPY start.ts      /app/start.ts
COPY deno.jsonc    /app/deno.jsonc

CMD ["deno", "run", "-A", "--unstable-kv", "/app/start.ts"]
