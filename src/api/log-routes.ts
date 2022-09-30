import { OpineRequest, OpineResponse } from "https://deno.land/x/opine/mod.ts";

import type { IConfig } from "../interfaces/config.ts";

export function logRoutes(cfg: IConfig) {
  const log = cfg.logger();

  return function (req: OpineRequest, _: OpineResponse, next: any) {
    log.info("Request Received", {
      path: req.path,
    });

    next();
  };
}
