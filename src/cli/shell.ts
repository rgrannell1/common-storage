// Shell command runner for CLI setup operations

export async function runCommand(cmd: string, args: string[]): Promise<void> {
  const proc = new Deno.Command(cmd, { args, stdin: "null", stdout: "inherit", stderr: "inherit" });
  const { code } = await proc.output();
  if (code !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} exited with code ${code}`);
  }
}
