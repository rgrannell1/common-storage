// Translates a storage WriteFailure into a RouteError at the API boundary.
// @work.md

import type { WriteFailure } from "../../storage/capabilities.ts";
import type { RouteError } from "../../commons/types/responses.ts";
import { MAX_PAYLOAD_BYTES } from "../../commons/constants.ts";

// topic_not_found maps to 404; payload_too_large maps to a 422 validation error.
export function writeFailureToError(failure: WriteFailure, topic: string): RouteError {
  if (failure.kind === "payload_too_large") {
    const msg = `Payload exceeds maximum size of ${MAX_PAYLOAD_BYTES} bytes`;
    return { kind: "validation_error", message: msg };
  }
  return { kind: "not_found", resource: topic };
}
