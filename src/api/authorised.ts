import { OpineResponse } from "https://deno.land/x/opine/mod.ts";
import { Status } from "https://deno.land/std/http/http_status.ts";

import type { IConfig } from "../types/interfaces/config.ts";
import type { User, CommonStorageRequest } from "../types/types.ts";


function userHasPermission(req: CommonStorageRequest, user: User) {
  // check the user has permission to access the route

  const method = req.method;
  const path = req.path;

  const permissions = user.permissions;

  for (const permission of permissions) {
    const { methods, route } = permission;

    const methodMatch = methods.includes(method) || methods.includes("*");
    const pathMatch = route.includes(path) || route.includes("*");

    if (methodMatch && pathMatch) {
      return true;
    }
  }

  return false;
}

function respondUnauthorised(req: CommonStorageRequest, res: OpineResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS, DELETE");
  res.setHeader("Access-Control-Max-Age", "86400");

  res.status = Status.Unauthorized;
  res.send({
    error: {
      message: "User not authorised",
    },
  });
}

function respondInsufficientPermissions(req: CommonStorageRequest, res: OpineResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS, DELETE");
  res.setHeader("Access-Control-Max-Age", "86400");

  res.status = Status.Unauthorized;
  res.send({
    error: {
      message: `User not authorised to access "${req.method} ${req.path}"`,
    },
  });
}

export function authorised(cfg: IConfig) {
  return function (req: CommonStorageRequest, res: OpineResponse, next: any) {
    const auth = req.headers.get("Authorization");

    if (auth) {
      const hasCredentials = auth.match(/^Basic\s+(.*)$/i);

      if (hasCredentials) {
        const [user, password] = atob(hasCredentials[1]).split(":");

        const users = cfg.users;
        const userConfig = users[user];

        // check the user is known
        if (users.hasOwnProperty(user) && userConfig.password) {
          // check the password matches
          const userPasswordMatch = password === userConfig.password;

          req.user = user;

          // just to ensure credentials are actually present...
          if (userPasswordMatch && user && password) {
            // ok, now do we have access to the method and route?

            if (userHasPermission(req, userConfig)) {
              return next();
            } else {
              return respondInsufficientPermissions(req, res);
            }
          }
        }
      }
    }

    return respondUnauthorised(req, res);
  };
}
