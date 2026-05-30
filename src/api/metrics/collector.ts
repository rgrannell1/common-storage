// KV-backed request metrics collector and Hono middleware for aspect-oriented stat gathering.
// Counters and per-minute buckets are persisted to KV so they survive isolate restarts on
// Deno Deploy. Storage concerns live in emitter.ts.

import type { MiddlewareHandler } from "hono";
import type { IStorageBackend } from "../../storage/kv/backend.ts";
import {
  METRICS_COUNTERS_KEY,
  METRICS_BUCKET_PREFIX,
  METRICS_BUCKET_TTL_MS,
  MS_PER_MINUTE,
  METRICS_RATE_WINDOW_1M_MINUTES,
  METRICS_RATE_WINDOW_5M_MINUTES,
  METRICS_RATE_WINDOW_1H_MINUTES,
  METRICS_RATE_WINDOW_1D_MINUTES,
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
    const minuteStart = Math.floor(Date.now() / MS_PER_MINUTE) * MS_PER_MINUTE;
    const bucketKey = [...METRICS_BUCKET_PREFIX, String(minuteStart)];

    const [countersRaw, bucketRaw] = await Promise.all([
      this.#storage.get<MetricsCounters>(METRICS_COUNTERS_KEY),
      this.#storage.get<MinuteBucket>(bucketKey),
    ]);
    const counters = countersRaw ?? emptyCounters();
    const bucket = bucketRaw ?? { count: 0 };

    counters.total++;
    counters.byMethod[method] = (counters.byMethod[method] ?? 0) + 1;
    counters.byStatus[statusKey] = (counters.byStatus[statusKey] ?? 0) + 1;
    bucket.count++;

    await Promise.all([
      this.#storage.set(METRICS_COUNTERS_KEY, counters),
      this.#storage.setWithExpiry(bucketKey, bucket, METRICS_BUCKET_TTL_MS),
    ]);
  }

  // Computes request rates for all four windows in a single KV scan.
  // Returns counts as [1m, 5m, 1h, 1d]; skips buckets with non-numeric keys.
  async #computeRates(now: number): Promise<[number, number, number, number]> {
    const cutoffs = [
      now - METRICS_RATE_WINDOW_1M_MINUTES * MS_PER_MINUTE,
      now - METRICS_RATE_WINDOW_5M_MINUTES * MS_PER_MINUTE,
      now - METRICS_RATE_WINDOW_1H_MINUTES * MS_PER_MINUTE,
      now - METRICS_RATE_WINDOW_1D_MINUTES * MS_PER_MINUTE,
    ];
    const totals: [number, number, number, number] = [0, 0, 0, 0];
    const bucketList = this.#storage.list<MinuteBucket>({
      prefix: METRICS_BUCKET_PREFIX,
    });
    for await (const { key, value } of bucketList) {
      const minuteStart = Number(key.at(-1));
      if (!Number.isFinite(minuteStart)) continue;
      for (let idx = 0; idx < cutoffs.length; idx++) {
        if (minuteStart >= cutoffs[idx]) totals[idx] += value.count;
      }
    }
    return totals;
  }

  async snapshot(): Promise<MetricsSnapshot> {
    const now = Date.now();
    const countersRaw = await this.#storage.get<MetricsCounters>(
      METRICS_COUNTERS_KEY,
    );
    const counters = countersRaw ?? emptyCounters();
    const [rate1m, rate5m, rate1h, rate1d] = await this.#computeRates(now);

    return {
      counters,
      rates: { "1m": rate1m, "5m": rate5m, "1h": rate1h, "1d": rate1d },
      startedAt: counters.startedAt,
      timestamp: now,
    };
  }
}

// Hono middleware that records method and response status into the collector after each request.
// Awaited so the KV write completes before the isolate exits on Deno Deploy.
// Errors from record() are swallowed — a KV failure must not convert a successful response
// into 500.
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
