# Hardened common-storage server container
# Config must be mounted at /config/config.json; KV data persists at /data

FROM denoland/deno:alpine-2.6.1

WORKDIR /app

# Cache dependencies in a separate layer so source changes don't invalidate it
COPY deno.json deno.lock ./
RUN deno install --frozen --node-modules-dir=none

COPY src/ ./src/
COPY main.ts ./

# deno user (uid 1000) is built into the official image — no root at runtime
USER deno

EXPOSE 2400

ENTRYPOINT [ \
  "deno", "run", \
  "--frozen", \
  "--allow-net", \
  "--allow-read=/app,/config", \
  "--allow-write=/data", \
  "--allow-env", \
  "main.ts" \
]
