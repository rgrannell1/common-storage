import { OpineRequest, OpineResponse } from "https://deno.land/x/opine/mod.ts";
import { Status } from "https://deno.land/std/http/http_status.ts";

import type { IConfig } from "../interfaces/config.ts";

export function authorised(cfg: IConfig) {
  return async function (req: OpineRequest, res: OpineResponse, next: any) {
    const auth = req.headers.get("Authorization");

    if (auth) {
      const hasCredentials = auth.match(/^Basic\s+(.*)$/i);

      if (hasCredentials) {
        const [user, password] = atob(hasCredentials[1]).split(":");
        const valid = user === cfg.user().name &&
          password === cfg.user().password;

        // just to ensure credentials are actually present...
        if (valid && user && password) {
          return next();
        }
      }
    }

    res.status = Status.Unauthorized;
    res.send({
      error: {
        message: "Not authorized",
      },
    });
  };
}
