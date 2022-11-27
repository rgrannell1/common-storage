import { OpineRequest, OpineResponse } from "https://deno.land/x/opine/mod.ts";
import { Status } from "https://deno.land/std/http/http_status.ts";

import type { IConfig } from "../../types/interfaces/config.ts";
import type { IStorage } from "../../types/interfaces/storage.ts";

export function subscriptionPost(cfg: IConfig) {
  return async function (req: OpineRequest, res: OpineResponse) {

  };
}
