import { Status } from "../shared/status.ts";
import {
  RATE_LIMIT_WINDOW,
  RATE_LIMIT_MAX_IN_WINDOW,
  RATE_LIMIT_THROTTLE_DURATION
} from "../shared/constants.ts";
import type {
  Config,
  Request,
  ILogger,
  SchemaValidator,
} from "../types/index.ts";

type RateLimitConfig = Partial<Config>
type Services = {
  storage: unknown;
  logger: ILogger;
  schema: SchemaValidator;
};

type RateLimiterOptions = {
  // what time period should we examine for rate-limiting?
  limitWindow: number;

  // how many requests can be sent in that time period?
  maxRate: number;

  // a user sent more than maxRequests in the limitWindow, so
  // throttle them for this duration
  throttleDuration: number;
}

export class RateLimiter {
  /*
   * Tracks the number of requests received in the configured time-window,
   * by IP address.
   *
   */

  throttles: Map<string, number>;
  observations: Map<string, number[]>
  limitWindow: number;
  maxRate: number;
  throttleDuration: number;

  constructor(opts: RateLimiterOptions) {
    const {
      limitWindow,
      maxRate,
      throttleDuration
    } = opts;

    this.observations = new Map();
    this.throttles = new Map();

    this.limitWindow = limitWindow;
    this.maxRate = maxRate;
    this.throttleDuration = throttleDuration;
  }

  isAllowListed(_: Request): boolean {
    return false;
  }

  /*
   * Get a user-identifier from the request
   *
   * @param {Request} req
   *
   */
  getIdentifier(req: Request): string {
    return req.ip;
  }

  /*
   * Add a timestamp for an identifier to the request-limiter
   * state.
   *
   * @param {Request} req
   *
   */
  add(req: Request): void {
    const now = Date.now();
    const identifier = this.getIdentifier(req);

    if (!this.observations.has(identifier)) {
      this.observations.set(identifier, []);
    }

    this.observations.get(identifier)?.push(now);
  }

  /*
   * Stateful function. Given a request, check how many other requests
   * were received in the configured time-window. It also truncates the
   * timestamps stored for a particular identifier to relevant entries
   *
   * @param {Request} req
   *
   * @returns {number} count
   */
  count(req: Request): number {
    const identifier = this.getIdentifier(req);
    const timestamps = this.observations.get(identifier) ?? [];

    const now = Date.now();
    const inRange = timestamps.filter(timestamp => {
      return (now - timestamp) < this.limitWindow;
    });

    this.observations.set(identifier, inRange);

    return inRange.length;
  }

  /*
   * Throttle a particular client for a given time-window
   *
   * @param {Request} req
   * @param {number} window
   */
  addThrottle(req: Request, window: number) {
    const identifier = this.getIdentifier(req);

    this.throttles.set(identifier, Date.now() + window);
  }

  /*
   * Was the rate exceeded for a given client?
   *
   * @param {Request} req
   *
   * @returns {boolean}
   */
  throttled(req: Request) {
    // let's not throttle some IP addresses
    if (this.isAllowListed(req)) {
      return false;
    }


    this.add(req);

    // there are too many requests in the configured time-window...
    const tooManyRecentObservations = this.count(req) > this.maxRate;

    if (tooManyRecentObservations) {
      this.addThrottle(req, this.throttleDuration);
      return true;
    }

    // there are not too many requests in the time window, but the
    // user is currently throttled for having sent too many
    const throttledUntil = this.throttles.get(this.getIdentifier(req));

    // is a throttle in place, and is it still active?
    return throttledUntil && throttledUntil > Date.now();
  }
}

/*
 * Rate-limiting middleware
 *
 */
export function rateLimit(cfg: RateLimitConfig, services: Services) {
  const limiter = new RateLimiter({
    limitWindow: RATE_LIMIT_WINDOW,
    maxRate: RATE_LIMIT_MAX_IN_WINDOW,
    throttleDuration: RATE_LIMIT_THROTTLE_DURATION
  });
  const { logger } = services;

  return async function (ctx: any, next: any) {
    const throttled = limiter.throttled(ctx.request);

    if (throttled) {
      await logger.addActivity({
        request: ctx.request,
        message: "rate-limit-exceeded",
        metadata: { },
      });

      ctx.response.status = Status.TooManyRequests;
      ctx.response.body = JSON.stringify({
        error: "Rate limit exceeded.",
      });
      return;
    };

    return await next(ctx);
  }
}
