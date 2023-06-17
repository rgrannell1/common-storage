import { OpineResponse } from "https://deno.land/x/opine/mod.ts";
import { Status } from "https://deno.land/std/http/http_status.ts";

import type { IConfig } from "../types/interfaces/config.ts";
import type { CommonStorageRequest } from "../types/types.ts";


export function authorised(cfg: IConfig) {
  return function (req: CommonStorageRequest, res: OpineResponse, next: any) {
    const auth = req.headers.get("Authorization");

    if (auth) {
      const hasCredentials = auth.match(/^Basic\s+(.*)$/i);

      if (hasCredentials) {
        const [user, password] = atob(hasCredentials[1]).split(":");

        const users = cfg.users;

        // check the user is known
        if (users.hasOwnProperty(user) && users[user].password) {
          // check the password matches
          const userPasswordMatch = password === users[user].password;

          req.user = user;

          // just to ensure credentials are actually present...
          if (userPasswordMatch && user && password) {
            return next();
          }
        }

      }
    }
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS, DELETE");
    res.setHeader("Access-Control-Max-Age", "86400");

    res.status = Status.Unauthorized;
    res.send({
      error: {
        message: "Not authorized",
      },
    });
  };
}
