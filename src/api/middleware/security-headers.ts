// Security headers middleware — sets hardened HTTP response headers on every response
// @work.md

import type { MiddlewareHandler, Context } from "hono";

type SecurityHeader = { name: string; value: string };

// Hardened response headers applied to every HTTP response
const SECURITY_HEADERS: SecurityHeader[] = [
  { name: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { name: "X-Content-Type-Options",    value: "nosniff" },
  { name: "X-Frame-Options",           value: "DENY" },
  { name: "X-XSS-Protection",          value: "1; mode=block" },
  { name: "Referrer-Policy",           value: "no-referrer" },
];

function applySecurityHeader(ctx: Context, header: SecurityHeader): void {
  ctx.res.headers.set(header.name, header.value);
}

export const securityHeaders: MiddlewareHandler = async (ctx, next) => {
  await next();
  for (const header of SECURITY_HEADERS) {
    applySecurityHeader(ctx, header);
  }
};
