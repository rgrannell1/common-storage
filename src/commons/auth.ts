// Macaroon minting and verification for common-storage authentication
// @work.md

// deno-lint-ignore-file no-explicit-any
import macaroons from "macaroons.js";

import type { TokenCaveatsConfig } from "./config.ts";
import { ok, err, type Result } from "./types/result.ts";
import type { AuthError } from "./types/auth.ts";

const { MacaroonsBuilder, MacaroonsVerifier, verifier: macaroonVerifiers } = macaroons as any;
const TimestampCaveatVerifier = macaroonVerifiers.TimestampCaveatVerifier as (caveat: string) => boolean;

// Embedded in every minted Macaroon as the location field
const MACAROON_LOCATION = "common-storage";

// Prefix used for the methods caveat
const METHODS_CAVEAT_PREFIX = "methods = ";

export type { AuthError };

export function mintToken(rootKey: string, name: string, caveats: TokenCaveatsConfig): string {
  let builder = new MacaroonsBuilder(MACAROON_LOCATION, rootKey, name);

  if (caveats.topic !== undefined) {
    builder = builder.add_first_party_caveat(`topic = ${caveats.topic}`);
  }
  if (caveats.methods !== undefined) {
    builder = builder.add_first_party_caveat(`${METHODS_CAVEAT_PREFIX}${caveats.methods.join(",")}`);
  }
  if (caveats.expires !== undefined) {
    builder = builder.add_first_party_caveat(`time < ${caveats.expires}`);
  }

  return builder.getMacaroon().serialize();
}

// Verifies a serialised Macaroon token against the root key and request context.
// Two-pass: first satisfies all caveats to isolate the HMAC check (→ invalid),
// then re-verifies with real context to distinguish caveat failures (→ forbidden).
// Returns the Macaroon identifier (the name used at mint time) on success; used to scope idempotency caches per caller.
export function verifyToken(
  rootKey: string,
  token: string,
  method: string,
  topic: string | undefined,
): Result<string, AuthError> {
  let macaroon;
  try {
    macaroon = MacaroonsBuilder.deserialize(token);
  } catch {
    return err({ kind: "invalid" });
  }

  const hmacVerifier = new MacaroonsVerifier(macaroon);
  hmacVerifier.satisfyGeneral(() => true);
  if (!hmacVerifier.isValid(rootKey)) {
    return err({ kind: "invalid" });
  }

  const caveatVerifier = new MacaroonsVerifier(macaroon);
  if (topic !== undefined) {
    caveatVerifier.satisfyExact(`topic = ${topic}`);
  }
  caveatVerifier.satisfyGeneral((caveat: string) => {
    if (!caveat.startsWith(METHODS_CAVEAT_PREFIX)) return false;
    const allowed = caveat.slice(METHODS_CAVEAT_PREFIX.length).split(",");
    return allowed.includes(method);
  });
  caveatVerifier.satisfyGeneral(TimestampCaveatVerifier);

  if (!caveatVerifier.isValid(rootKey)) {
    return err({ kind: "forbidden", reason: "token caveats not satisfied" });
  }

  return ok(macaroon.identifier as string);
}
