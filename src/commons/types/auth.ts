// Auth error variants returned by token verification
// @work.md

// invalid — HMAC chain is broken or the token is malformed (→ 401)
// forbidden — HMAC is valid but one or more caveats are not satisfied (→ 403)
export type AuthError =
  | { kind: "invalid" }
  | { kind: "forbidden"; reason: string };
