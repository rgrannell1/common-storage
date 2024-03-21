/*
 * Roles associate permissions in a named-group.
 */
export type Role = {
  name: string;
  created: string;
  permissions: Permission[];
};

/*
 * User can authenticate and are granted permissions
 * defined by a role
 */
export type User = {
  name: string;
  role: string;
  password: string;
  hash?: string;
  created: string;
};

/*
 * Permissions are defined for particular combinations of
 * route and topic
 */
export type Permission = {
  routes: string | string[];
  topics: string | string[];
};

/*
 * Admin authentication can be in one of the following states
 */
export enum AdminAuthenticationState {
  MissingConfiguration,
  InvalidHeader,
  IncorrectCredentials,
  Authenticated,
}

/*
 * Role authentication can be in one of the following states
 */
export enum RoleAuthenticationState {
  AdminUser,
  MissingConfiguration,
  InvalidHeader,
  IncorrectCredentials,
  Authenticated,
  UserNotRegistered,
  RoleMissing,
  NotAuthorised,
}
