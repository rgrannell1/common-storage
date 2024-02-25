/*
 * Note: Bcrypt has to be used synchronously, as Deno Deploy
 * does not provide `Worker`
 */
import { Status } from "../shared/status.ts";
import * as bcrypt from "https://deno.land/x/bcrypt/mod.ts";

import {
  AdminAuthenticationState,
  RoleAuthenticationState,
} from "../types/index.ts";
import type {
  Config,
  IGetRole,
  IGetUser,
  ILogger,
  SchemaValidator,
} from "../types/index.ts";
import { HeaderParsers } from "../services/parsers.ts";

type Services = {
  storage: IGetUser & IGetRole;
  logger: ILogger;
  schema: SchemaValidator;
};

type AdminConfig = Partial<Config> & {
  adminUsername: string;
  adminPassword: string;
};

/*
 * Authenticate administrator access; if it fails give a state indicating why
 *
 * @param { string } adminUsername
 * @param { string } adminPassword
 * @param { any } ctx
 *
 * @returns
 */
async function isAdminAuthenticated(
  adminUsername: string,
  adminPassword: string,
  ctx: any,
): Promise<{ authenticated: boolean; state: AdminAuthenticationState }> {
  if (!adminUsername || !adminPassword) {
    return {
      authenticated: false,
      state: AdminAuthenticationState.MissingConfiguration,
    };
  }

  // extract username and password from Basic authentication header
  let credentials: { username: string; password: string };

  try {
    credentials = HeaderParsers.basicAuthentication(ctx.request);
  } catch (_) {
    return {
      authenticated: false,
      state: AdminAuthenticationState.InvalidHeader,
    };
  }

  const { username, password } = credentials;

  const adminPasswordHash = bcrypt.hashSync(adminPassword);

  const usernameMatch = username === adminUsername;
  const passwordMatch = bcrypt.compareSync(password, adminPasswordHash);

  if (!usernameMatch || !passwordMatch) {
    return {
      authenticated: false,
      state: AdminAuthenticationState.IncorrectCredentials,
    };
  }

  return {
    authenticated: true,
    state: AdminAuthenticationState.Authenticated,
  };
}

/*
 * Authenticate role access; if it fails give a state indicating why
 */
async function isRoleAuthenticated(
  cfg: AdminConfig,
  services: Services,
  ctx: any,
) {
  const { storage } = services;
  const { adminUsername } = cfg;

  // extract username and password from Basic authentication header

  let credentials: { username: string; password: string };
  try {
    credentials = HeaderParsers.basicAuthentication(ctx.request);
  } catch (_) {
    return {
      authenticated: false,
      state: RoleAuthenticationState.InvalidHeader,
    };
  }

  const { username, password } = credentials;

  if (!username || !password) {
    return {
      authenticated: false,
      state: RoleAuthenticationState.IncorrectCredentials,
    };
  }

  if (username === adminUsername) {
    return {
      authenticated: false,
      state: RoleAuthenticationState.AdminUser,
    };
  }

  // retrieve the user
  const user = await storage.getUser(username);
  if (!user) {
    return {
      authenticated: false,
      state: RoleAuthenticationState.UserNotRegistered,
    };
  }

  // check the password matches the stored bcrypt hash, or in the case
  // of service accounts the actual password itself
  const actualPassword = user.hash ? user.hash : bcrypt.hashSync(user.password);
  const passwordMatch = bcrypt.compareSync(password, actualPassword);

  if (!passwordMatch) {
    return {
      authenticated: false,
      state: RoleAuthenticationState.IncorrectCredentials,
    };
  }

  // the user matches; retrieve the associated role
  const role = await storage.getRole(user.role);

  if (!role) {
    return {
      authenticated: false,
      state: RoleAuthenticationState.RoleMissing,
    };
  }

  // check whether the user has permission to the route
  const pathname = ctx.request.url.pathname;
  const method = ctx.request.method;

  const parts = pathname.match(/\/(.+?)\/(.+)/);
  if (!parts) {
    throw new Error(`failed to parse route ${pathname}`);
  }

  const [_, routeName, topic] = parts;
  for (const permission of role.permissions) {
    // if the permission is for all topics, or the topic is explicitly allowed
    const topicMatches = permission.topics === "ALL" ||
      (permission.topics as string[]).some((candidate) => {
        return candidate == topic;
      });

    // if the permission is for all routes, or the method-route is explicity allowed
    const routeMatches = permission.routes === "ALL" ||
      (permission.routes as string[]).some((candidate) => {
        return candidate === `${method} /${routeName}`;
      });

    // if both the topic and route is allowed, invoke the requested route
    if (topicMatches && routeMatches) {
      ctx.state = {
        ...(ctx.state ?? {}),
        user: username,
        authenticationMethod: "role-based",
        permissions: role.permissions,
      };

      return {
        authenticated: true,
        state: RoleAuthenticationState.Authenticated,
      };
    }
  }

  return {
    authenticated: false,
    state: RoleAuthenticationState.NotAuthorised,
  };
}

/*
 * Provide administrator access to /role and /user routes
 */
export function adminAccess(cfg: AdminConfig, services: Services) {
  const { logger } = services;
  const { adminUsername, adminPassword } = cfg;

  return async function (ctx: any, next: any) {
    await logger.addActivity({
      request: ctx.request,
      message: "admin-authentication",
      metadata: {},
    });

    const { authenticated, state } = await isAdminAuthenticated(
      adminUsername,
      adminPassword,
      ctx,
    );

    if (state === AdminAuthenticationState.MissingConfiguration) {
      ctx.response.status = Status.Unauthorized;
      ctx.response.body = JSON.stringify({
        error: "Administrator authentication is not configured",
      });
    } else if (state === AdminAuthenticationState.InvalidHeader) {
      ctx.response.status = Status.Unauthorized;
      ctx.response.body = JSON.stringify({
        error: "Invalid authentication header",
      });
    } else if (state === AdminAuthenticationState.IncorrectCredentials) {
      ctx.response.status = Status.Unauthorized;
      ctx.response.body = JSON.stringify({
        error: "Incorrect credentials for administrator account",
      });
    } else if (
      state === AdminAuthenticationState.Authenticated && authenticated
    ) {
      ctx.state = {
        ...(ctx.state ?? {}),
        user: adminUsername,
        authenticationMethod: "admin",
      };

      // allow access to subsequent routes
      return await next(ctx);
    } else {
      throw new Error(`unexpected authentication state ${state}`);
    }
  };
}

export function roleAccess(cfg: AdminConfig, services: Services) {
  const { adminUsername, adminPassword } = cfg;
  const { logger } = services;

  return async function (ctx: any, next: any) {
    await logger.addActivity({
      request: ctx.request,
      message: "role-authentication",
      metadata: {},
    });

    const { authenticated, state } = await isAdminAuthenticated(
      adminUsername,
      adminPassword,
      ctx,
    );

    if (state === AdminAuthenticationState.MissingConfiguration) {
      ctx.response.status = Status.Unauthorized;
      ctx.response.body = JSON.stringify({
        error: "Administrator authentication is not configured",
      });
      return;
    } else if (state === AdminAuthenticationState.InvalidHeader) {
      ctx.response.status = Status.Unauthorized;
      ctx.response.body = JSON.stringify({
        error: "Invalid authentication header",
      });
      return;
    } else if (
      state === AdminAuthenticationState.Authenticated && authenticated
    ) {
      ctx.state = {
        ...(ctx.state ?? {}),
        user: adminUsername,
        authenticationMethod: "admin",
      };

      await logger.addActivity({
        request: ctx.request,
        message: "authenticated as administrator",
        metadata: {},
      });

      // allow access to subsequent routes
      return await next(ctx);
    }

    // Failed to authenticate as administrator, so try authenticate as a role

    const roleAuthenticated = await isRoleAuthenticated(cfg, services, ctx);
    const roleState = roleAuthenticated.state;

    // Handle each potential state for role-based authentication
    if (roleState === RoleAuthenticationState.InvalidHeader) {
      ctx.response.status = Status.Unauthorized;
      ctx.response.body = JSON.stringify({
        error: "Invalid authentication header",
      });
    } else if (roleState === RoleAuthenticationState.IncorrectCredentials) {
      ctx.response.status = Status.Unauthorized;
      ctx.response.body = JSON.stringify({
        error: "Invalid credentials for user",
      });
    } else if (roleState === RoleAuthenticationState.AdminUser) {
      ctx.response.status = Status.Unauthorized;
      ctx.response.body = JSON.stringify({
        error: "Cannot use administrator account for role-based access",
      });
    } else if (roleState === RoleAuthenticationState.UserNotRegistered) {
      ctx.response.status = Status.Unauthorized;
      ctx.response.body = JSON.stringify({
        error: "User not registered",
      });
    } else if (roleState === RoleAuthenticationState.RoleMissing) {
      ctx.response.status = Status.Unauthorized;
      ctx.response.body = JSON.stringify({
        error: "Role does not exist",
      });
    } else if (roleState === RoleAuthenticationState.NotAuthorised) {
      ctx.response.status = Status.Unauthorized;
      ctx.response.body = JSON.stringify({
        error: "Not authorised",
      });
    } else if (roleState === RoleAuthenticationState.Authenticated) {
      await logger.addActivity({
        request: ctx.request,
        message: "authenticated with role",
        metadata: {},
      });

      return await next(ctx);
    } else {
      throw new Error(`unexpected authentication state ${roleState}`);
    }
  };
}
