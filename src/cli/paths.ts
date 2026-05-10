// XDG-aware path resolution for common-storage CLI config and service files

import { CONFIG_DIR_NAME, CONFIG_FILE_NAME } from "../commons/constants.ts";

const SYSTEMD_SERVICE_NAME = "common-storage";

export function xdgConfigHome(): string {
  return Deno.env.get("XDG_CONFIG_HOME") ?? `${Deno.env.get("HOME") ?? "/root"}/.config`;
}

export function parentDir(path: string): string {
  return path.slice(0, path.lastIndexOf("/"));
}

export function resolveConfigPath(xdgHome: string): string {
  return `${xdgHome}/${CONFIG_DIR_NAME}/${CONFIG_FILE_NAME}`;
}

export function resolveSystemdServicePath(xdgHome: string): string {
  return `${xdgHome}/systemd/user/${SYSTEMD_SERVICE_NAME}.service`;
}
