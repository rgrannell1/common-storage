import { nanoid } from "https://deno.land/x/nanoid/mod.ts";
import { OpineResponse } from "https://deno.land/x/opine/mod.ts";

import type { IConfig } from "../types/interfaces/config.ts";
import type { CommonStorageRequest } from "../types/types.ts";

/*
 * Log requests
 */
export function logRoutes(cfg: IConfig) {
  const log = cfg.logger;

  return function (
    req: CommonStorageRequest,
    _: OpineResponse,
    next: () => void,
  ) {
    req.requestId = nanoid();

    log.info("Request Received", {
      method: req.method,
      path: req.path,
    });

    next();
  };
}
