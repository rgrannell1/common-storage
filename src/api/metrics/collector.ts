// In-memory request metrics collector and Hono middleware for aspect-oriented stat gathering.
// Tracks ever-accumulating counters and a per-minute bucket ring for sliding-window rates.
// Storage concerns live in emitter.ts.

import type { MiddlewareHandler } from "hono";

// Maximum age of rate buckets kept in memory
const MAX_BUCKET_AGE_MINUTES = 1440;

// Milliseconds per minute, used to map timestamps to minute-aligned bucket starts
const MS_PER_MINUTE = 60_000;

type MinuteBucket = { minuteStart: number; count: number };

type RateWindows = {
  "1m": number;
  "5m": number;
  "1h": number;
  "1d": number;
};

export type MetricsSnapshot = {
  counters: {
    total: number;
    byMethod: Record<string, number>;
    byStatus: Record<string, number>;
  };
  rates: RateWindows;
  uptimeMs: number;
  timestamp: number;
};

export class MetricsCollector {
  #total = 0;
  #byMethod: Record<string, number> = {};
  #byStatus: Record<string, number> = {};
  #buckets: MinuteBucket[] = [];
  #startedAt = Date.now();

  record(method: string, status: number): void {
    this.#total++;
    this.#byMethod[method] = (this.#byMethod[method] ?? 0) + 1;
    const statusKey = String(status);
    this.#byStatus[statusKey] = (this.#byStatus[statusKey] ?? 0) + 1;
    this.#recordBucket();
  }

  // Increments the active minute bucket, creating a new one when the minute rolls over.
  #recordBucket(): void {
    const now = Date.now();
    const minuteStart = Math.floor(now / MS_PER_MINUTE) * MS_PER_MINUTE;
    const last = this.#buckets.at(-1);
    if (last?.minuteStart === minuteStart) {
      last.count++;
    } else {
      this.#buckets.push({ minuteStart, count: 1 });
      this.#trimBuckets(now);
    }
  }

  // Drops buckets older than MAX_BUCKET_AGE_MINUTES from the head of the ring.
  #trimBuckets(now: number): void {
    const cutoff = now - MAX_BUCKET_AGE_MINUTES * MS_PER_MINUTE;
    const firstValid = this.#buckets.findIndex(bucket => bucket.minuteStart >= cutoff);
    if (firstValid > 0) this.#buckets.splice(0, firstValid);
  }

  // Sums all request counts within the given number of minutes from now.
  #rateForMinutes(minutes: number): number {
    const cutoff = Date.now() - minutes * MS_PER_MINUTE;
    return this.#buckets
      .filter(bucket => bucket.minuteStart >= cutoff)
      .reduce((sum, bucket) => sum + bucket.count, 0);
  }

  snapshot(): MetricsSnapshot {
    return {
      counters: {
        total: this.#total,
        byMethod: { ...this.#byMethod },
        byStatus: { ...this.#byStatus },
      },
      rates: {
        "1m": this.#rateForMinutes(1),
        "5m": this.#rateForMinutes(5),
        "1h": this.#rateForMinutes(60),
        "1d": this.#rateForMinutes(1440),
      },
      uptimeMs: Date.now() - this.#startedAt,
      timestamp: Date.now(),
    };
  }
}

// Hono middleware that records method and response status into the collector after each request.
export function metricsMiddleware(collector: MetricsCollector): MiddlewareHandler {
  return async (ctx, next) => {
    await next();
    collector.record(ctx.req.method, ctx.res.status);
  };
}
