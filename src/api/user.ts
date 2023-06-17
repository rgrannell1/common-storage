
export type Permission = {
  route: string
  allowedMethods: string[]
}

export class User {
  username: string;
  permissions: Permission[];

  constructor(username: string, permissions: Permission[]) {
    this.username = username;
    this.permissions = permissions;
  }

  routeAllowed(route: string, method: string): boolean {
    for (const perm of this.permissions) {
      if (perm.route !== route && perm.route !== '*') {
        continue
      }

      if (perm.allowedMethods.includes(method) || perm.allowedMethods.includes('*')) {
        return true
      }
    }

    return false
  }
}
