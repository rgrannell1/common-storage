// Entry point for the common-storage CLI — parses args and dispatches to commands

import { docopt } from "docopt";
import { init } from "./commands/init.ts";
import { mint } from "./commands/mint.ts";
import { validate } from "./commands/validate.ts";
import { auth } from "./commands/auth.ts";
import { httpCommand } from "./commands/client/mod.ts";

const DOC = `
cs - common-storage CLI

Usage:
  cs init                                            [--cfg <path>]
  cs validate                                        [--cfg <path>]
  cs mint [<name>]                                   [--cfg <path>]
  cs auth <alias> --qr [<name>]                      [--cfg <path>]
  cs http get feed                                   [--cfg <path>] [--server <alias>]
  cs http get content  -p topic=<topic>              [--cfg <path>] [--server <alias>] [-p start=<id>] [-p size=<n>]
  cs http get entry    -p topic=<topic> -p id=<id>   [--cfg <path>] [--server <alias>]
  cs http post content -p topic=<topic>              [--cfg <path>] [--server <alias>] [<payload>]
  cs http put entry    -p topic=<topic> -p id=<id>   [--cfg <path>] [--server <alias>] [<payload>]
  cs http get objects  -p topic=<topic>              [--cfg <path>] [--server <alias>]
  cs http get object   -p topic=<topic> -p id=<id>   [--cfg <path>] [--server <alias>]
  cs http put object   -p topic=<topic> -p id=<id>   [--cfg <path>] [--server <alias>] [<payload>]
  cs http delete object -p topic=<topic> -p id=<id>  [--cfg <path>] [--server <alias>]
  cs (-h | --help)

Options:
  --cfg <path>      Path to config file; defaults to XDG config dir
  --server <alias>  Server alias from config to target; defaults to defaultServer in config, then "local"
  -p <param>        Key=value parameter (topic, id, start, size)
  -h --help         Show this help

Commands:
  init              Create config skeleton if absent
  validate          Parse and validate the config file, reporting any errors
  mint [<name>]     Print a token for the named definition, or all name/token pairs
  auth <alias> --qr [<name>]  Print a QR code for the token URL targeting a server alias
  http              Make an API request to a common-storage server
`;

const args = docopt(DOC, { argv: Deno.args });

const cfgArg = args["--cfg"] as string | null;

if (args["init"]) {
  await init(cfgArg);
} else if (args["validate"]) {
  await validate(cfgArg);
} else if (args["mint"]) {
  await mint(args["<name>"] ?? undefined, cfgArg);
} else if (args["auth"]) {
  await auth(args["<alias>"] as string, args["<name>"] ?? undefined, cfgArg);
} else if (args["http"]) {
  await httpCommand(args as Record<string, unknown>);
}
