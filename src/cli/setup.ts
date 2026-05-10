// Server setup handlers for systemd user services and Docker containers

import { SYSTEMD_SERVICE_NAME } from "../commons/constants.ts";
import { resolveSystemdServicePath, parentDir } from "./paths.ts";
import { promptYesNo } from "./prompt.ts";
import { runCommand } from "./shell.ts";

async function setupSystemd(xdgHome: string): Promise<void> {
  const serviceContent = await Deno.readTextFile(new URL("./common-storage.service", import.meta.url));
  const servicePath = resolveSystemdServicePath(xdgHome);
  await Deno.mkdir(parentDir(servicePath), { recursive: true });
  await Deno.writeTextFile(servicePath, serviceContent);
  await runCommand("systemctl", ["--user", "daemon-reload"]);
  await runCommand("systemctl", ["--user", "enable", "--now", SYSTEMD_SERVICE_NAME]);
  console.log(`Service enabled. Check status with: systemctl --user status ${SYSTEMD_SERVICE_NAME}`);
}

async function setupDocker(): Promise<void> {
  console.error("Docker setup is not yet implemented.");
}

export async function promptSetup(xdgHome: string): Promise<void> {
  if (promptYesNo("Run as a systemd user service?")) {
    await setupSystemd(xdgHome);
    return;
  }
  if (promptYesNo("Run as a Docker container?")) {
    await setupDocker();
  }
}
