// XDG-aware path resolution for common-storage CLI config and service files

import { CONFIG_DIR_NAME, CONFIG_FILE_NAME } from "../commons/constants.ts";

const SYSTEMD_SERVICE_NAME = "common-storage";

// Expands a leading ~ or ~/ to the user's home directory; ~username forms are left unchanged
export function expandHome(path: string): string {
  if (path !== "~" && !path.startsWith("~/")) return path;
  const home = Deno.env.get("HOME") ?? "/root";
  return `${home}${path.slice(1)}`;
}

export function xdgConfigHome(): string {
  const xdg = Deno.env.get("XDG_CONFIG_HOME");
  const home = Deno.env.get("HOME") ?? "/root";
  return xdg ? expandHome(xdg) : `${home}/.config`;
}

export function parentDir(path: string): string {
  return path.slice(0, path.lastIndexOf("/"));
}

export function resolveConfigPath(xdgHome: string): string {
  return `${xdgHome}/${CONFIG_DIR_NAME}/${CONFIG_FILE_NAME}`;
}

// Returns the config file path: explicit --cfg arg takes precedence over XDG default
export function resolveConfigFilePath(cfgArg: string | null): string {
  return cfgArg ? expandHome(cfgArg) : resolveConfigPath(xdgConfigHome());
}

export function resolveSystemdServicePath(xdgHome: string): string {
  return `${xdgHome}/systemd/user/${SYSTEMD_SERVICE_NAME}.service`;
}
