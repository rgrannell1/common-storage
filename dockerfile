# syntax=docker/dockerfile:1
FROM denoland/deno:1.10.3
WORKDIR /app

COPY src/ /app


CMD [ "deno", "run", "-A", "/app/launch.ts" ]
