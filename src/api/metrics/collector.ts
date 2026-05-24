// KV-backed request metrics collector and Hono middleware for aspect-oriented stat gathering.
// Counters and per-minute buckets are persisted to KV so they survive isolate restarts on Deno Deploy.
// Storage concerns live in emitter.ts.

import type { MiddlewareHandler } from "hono";
import type { IStorageBackend } from "../storage/backend.ts";
import {
  METRICS_COUNTERS_KEY,
  METRICS_BUCKET_PREFIX,
  METRICS_BUCKET_TTL_MS,
  MS_PER_MINUTE,
} from "../../commons/constants.ts";

type MetricsCounters = {
  total: number;
  byMethod: Record<string, number>;
  byStatus: Record<string, number>;
  // Epoch ms when this counter key was first created; persists across isolate restarts
  startedAt: number;
};

type MinuteBucket = { count: number };

type RateWindows = {
  "1m": number;
  "5m": number;
  "1h": number;
  "1d": number;
};

export type MetricsSnapshot = {
  counters: MetricsCounters;
  rates: RateWindows;
  // Epoch ms when KV counters were first initialised; replaces the old in-memory uptimeMs origin
  startedAt: number;
  timestamp: number;
};

// Returns a fresh zero-value counters object with no shared references between calls
function emptyCounters(): MetricsCounters {
  return { total: 0, byMethod: {}, byStatus: {}, startedAt: Date.now() };
}

export class MetricsCollector {
  #storage: IStorageBackend;

  constructor(storage: IStorageBackend) {
    this.#storage = storage;
  }

  // Increments the persisted counters and the current minute's bucket.
  // Non-atomic read-modify-write is intentional — approximate counts are acceptable for metrics.
  // Under concurrent Deno Deploy isolates, counts may be under-reported by up to N-1 per burst.
  async record(method: string, status: number): Promise<void> {
    const statusKey = String(status);
    const counters = await this.#storage.get<MetricsCounters>(METRICS_COUNTERS_KEY) ?? emptyCounters();

    counters.total++;
    counters.byMethod[method] = (counters.byMethod[method] ?? 0) + 1;
    counters.byStatus[statusKey] = (counters.byStatus[statusKey] ?? 0) + 1;

    const minuteStart = Math.floor(Date.now() / MS_PER_MINUTE) * MS_PER_MINUTE;
    const bucketKey = [...METRICS_BUCKET_PREFIX, String(minuteStart)];
    const bucket = await this.#storage.get<MinuteBucket>(bucketKey) ?? { count: 0 };
    bucket.count++;

    await Promise.all([
      this.#storage.set(METRICS_COUNTERS_KEY, counters),
      this.#storage.setWithExpiry(bucketKey, bucket, METRICS_BUCKET_TTL_MS),
    ]);
  }

  // Sums bucket counts within the given number of minutes from now.
  // Skips buckets with non-numeric keys to guard against corrupted or unexpected KV entries.
  async #rateForMinutes(minutes: number): Promise<number> {
    const cutoff = Date.now() - minutes * MS_PER_MINUTE;
    let total = 0;
    for await (const { key, value } of this.#storage.list<MinuteBucket>({ prefix: METRICS_BUCKET_PREFIX })) {
      const minuteStart = Number(key.at(-1));
      if (!Number.isFinite(minuteStart)) continue;
      if (minuteStart >= cutoff) total += value.count;
    }
    return total;
  }

  async snapshot(): Promise<MetricsSnapshot> {
    const counters = await this.#storage.get<MetricsCounters>(METRICS_COUNTERS_KEY) ?? emptyCounters();
    const [rate1m, rate5m, rate1h, rate1d] = await Promise.all([
      this.#rateForMinutes(1),
      this.#rateForMinutes(5),
      this.#rateForMinutes(60),
      this.#rateForMinutes(1440),
    ]);

    return {
      counters,
      rates: { "1m": rate1m, "5m": rate5m, "1h": rate1h, "1d": rate1d },
      startedAt: counters.startedAt,
      timestamp: Date.now(),
    };
  }
}

// Hono middleware that records method and response status into the collector after each request.
// Awaited so the KV write completes before the isolate exits on Deno Deploy.
// Errors from record() are swallowed — a KV failure must not convert a successful response into 500.
export function metricsMiddleware(collector: MetricsCollector): MiddlewareHandler {
  return async (ctx, next) => {
    await next();
    try {
      await collector.record(ctx.req.method, ctx.res.status);
    } catch {
      // intentionally swallowed — metrics errors are non-fatal
    }
  };
}
