import { OpineRequest, OpineResponse } from "https://deno.land/x/opine/mod.ts";

import type { IConfig } from "../types/interfaces/config.ts";

export function setHeaders(_: IConfig) {
  return function (_: OpineRequest, res: OpineResponse, next: any) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");

    next();
  };
}
