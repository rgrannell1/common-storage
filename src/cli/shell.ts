// Shell command runner and shared CLI utilities

export async function runCommand(cmd: string, args: string[]): Promise<void> {
  const proc = new Deno.Command(cmd, { args, stdin: "null", stdout: "inherit", stderr: "inherit" });
  const { code } = await proc.output();
  if (code !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} exited with code ${code}`);
  }
}

// Reads a required env var; prints an error and exits if unset
export function resolveEnvVar(envVarName: string): string {
  const value = Deno.env.get(envVarName);
  if (!value) {
    console.error(`Env var '${envVarName}' is not set`);
    Deno.exit(1);
  }
  return value;
}
