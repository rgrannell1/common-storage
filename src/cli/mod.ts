// Entry point for the common-storage CLI — parses args and dispatches to commands

import { docopt } from "docopt";
import { init } from "./commands/init.ts";
import { mint } from "./commands/mint.ts";
import { validate } from "./commands/validate.ts";

const DOC = `
cs - common-storage CLI

Usage:
  cs init
  cs validate
  cs mint [<name>]
  cs http get feed                                   [--server <alias>]
  cs http get content  -p topic=<topic>              [--server <alias>] [-p start=<id>] [-p size=<n>]
  cs http get entry    -p topic=<topic> -p id=<id>   [--server <alias>]
  cs http post content -p topic=<topic>              [--server <alias>] [<payload>]
  cs http put entry    -p topic=<topic> -p id=<id>   [--server <alias>] [<payload>]
  cs http get objects  -p topic=<topic>              [--server <alias>]
  cs http get object   -p topic=<topic> -p id=<id>   [--server <alias>]
  cs http put object   -p topic=<topic> -p id=<id>   [--server <alias>] [<payload>]
  cs http delete object -p topic=<topic> -p id=<id>  [--server <alias>]
  cs (-h | --help)

Options:
  --server <alias>  Server alias from config to target [default: local]
  -p <param>        Key=value parameter (topic, id, start, size)
  -h --help         Show this help

Commands:
  init              Create config skeleton if absent
  validate          Parse and validate the config file, reporting any errors
  mint [<name>]     Print a token for the named definition, or all name/token pairs
  http              Make an API request to a common-storage server
`;

const args = docopt(DOC, { argv: Deno.args });

if (args["init"]) {
  await init();
} else if (args["validate"]) {
  await validate();
} else if (args["mint"]) {
  await mint(args["<name>"] ?? undefined);
}
