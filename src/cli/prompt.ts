// Interactive prompt primitives for the common-storage CLI

export function promptYesNo(question: string): boolean {
  const answer = prompt(`${question} [y/N]`)?.trim().toLowerCase() ?? "";
  return answer === "y" || answer === "yes";
}

export async function openEditor(path: string): Promise<void> {
  const editor = Deno.env.get("EDITOR") ?? "nano";
  const proc = new Deno.Command(editor, {
    args: [path],
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const { code } = await proc.output();
  if (code !== 0) {
    throw new Error(`Editor exited with code ${code}`);
  }
}
