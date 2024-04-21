/*
 * Application dependencies.
 */

// used by oak server
export {
  Application,
  Context,
  Router,
} from "https://deno.land/x/oak@v12.6.2/mod.ts";
export { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
export type { Request } from "https://deno.land/x/oak@v12.6.2/mod.ts";

// bcrypt for authentication
export * as bcrypt from "https://deno.land/x/bcrypt/mod.ts";


// used by the CLI
export * as docopt from "https://deno.land/x/docopt@v1.0.5/mod.ts";

// for streaming json content from the server
export {
  JSONLinesStringifyStream,
  JSONLinesParseStream
} from "https://deno.land/x/jsonlines@v1.2.1/js/mod.js";
