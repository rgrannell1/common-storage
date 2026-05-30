// Request logging middleware — logs inbound requests and unhandled errors to the injected logger

import type { Context, Next } from "hono";
import type { ILogger } from "../../commons/logger.ts";

// Logs each request before passing on; catches and logs unhandled errors then re-throws
export function loggingMiddleware(logger: ILogger) {
  return async (ctx: Context, next: Next): Promise<void> => {
    logger.info("request received", ctx.req.raw, {});
    try {
      await next();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      logger.error("unhandled error", ctx.req.raw, { message, stack });
      throw err;
    }
  };
}
