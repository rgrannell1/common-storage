// In-memory request metrics collector and Hono middleware for aspect-oriented stat gathering.
// The collector is pure in-memory; storage concerns live in emitter.ts.

import type { MiddlewareHandler } from "hono";

export type MetricsSnapshot = {
  total: number;
  byMethod: Record<string, number>;
  byStatus: Record<string, number>;
};

export class MetricsCollector {
  #total = 0;
  #byMethod: Record<string, number> = {};
  #byStatus: Record<string, number> = {};

  record(method: string, status: number): void {
    this.#total++;
    this.#byMethod[method] = (this.#byMethod[method] ?? 0) + 1;
    const statusKey = String(status);
    this.#byStatus[statusKey] = (this.#byStatus[statusKey] ?? 0) + 1;
  }

  // Returns a snapshot of accumulated counts and resets all counters.
  flush(): MetricsSnapshot {
    const snapshot = {
      total: this.#total,
      byMethod: { ...this.#byMethod },
      byStatus: { ...this.#byStatus },
    };
    this.#total = 0;
    this.#byMethod = {};
    this.#byStatus = {};
    return snapshot;
  }
}

// Hono middleware that records method and response status into the collector after each request.
export function metricsMiddleware(collector: MetricsCollector): MiddlewareHandler {
  return async (ctx, next) => {
    await next();
    collector.record(ctx.req.method, ctx.res.status);
  };
}
