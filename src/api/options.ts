import { OpineRequest, OpineResponse } from "https://deno.land/x/opine/mod.ts";
import { Status } from "https://deno.land/std/http/http_status.ts";

import type { IConfig } from "../../types/interfaces/config.ts";

export function options(cfg: IConfig) {
  return async function (_: OpineRequest, res: OpineResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS, DELETE');
    res.setHeader('Access-Control-Max-Age', '86400');

    res.send(Status.NoContent);
  };
}
