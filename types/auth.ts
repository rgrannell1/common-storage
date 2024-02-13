export type Role = {
  name: string;
  created: string;
  permissions: Permission[];
};

export type User = {
  name: string;
  role: string;
  password: string;
  created: string;
};

export type Permission = {
  routes: string | string[];
  topics: string | string[];
};

export enum AdminAuthenticationState {
  MissingConfiguration,
  InvalidHeader,
  IncorrectCredentials,
  Authenticated,
}

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
