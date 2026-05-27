// Builds a client-side Merkle tree from local event entries for use in subscription sync.
// Delegates to the platform-agnostic core implementation.

import type { EventEntry } from "../../storage/capabilities.ts";
import { buildEventMerkleTree, type ClientMerkleTree } from "../../core/diff.ts";

export function buildDiffTree(entries: EventEntry[]): ClientMerkleTree {
  return buildEventMerkleTree(entries);
}
