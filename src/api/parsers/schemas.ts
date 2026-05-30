// Shared Zod field schemas and composed object schemas assembled by route files

import { z } from "zod";

// -- Scalar fields --

// Name of a topic; used as a path parameter and in response bodies
export const TopicNameSchema = z.string().min(1).max(128);

// Human-readable name of this server instance
export const TitleSchema = z.string().min(1);

// Human-readable description of this server instance
export const DescriptionSchema = z.string();

// Semantic version string of the running server
export const VersionSchema = z.string();

// Unix epoch milliseconds; used for createdAt, updatedAt, lastUpdated
export const TimestampSchema = z.number().int().nonnegative();

// Number of entries in a topic
export const CountSchema = z.number().int().nonnegative();

// Subscription poll interval in seconds
export const FrequencySchema = z.number().int().positive();

// URL of a remote common-storage content endpoint
export const SourceUrlSchema = z.string().url();

// Whether the response should be formatted for human reading
export const HumanFlagSchema = z.boolean();

// Timestamp as an ISO 8601 string; used in human-readable responses
export const IsoTimestampSchema = z.string();

// ID of the first entry to return in a paginated response
export const StartSchema = z.number().int().nonnegative();

// Maximum number of entries to return in a paginated response
export const SizeSchema = z.number().int().positive();

// Composed object schemas

// Epoch milliseconds or ISO 8601 string; machine responses use numbers, human responses use strings
const FlexTimestampSchema = z.union([TimestampSchema, IsoTimestampSchema]);

export const TopicSummarySchema = z.object({
  // Name of the topic
  topic: TopicNameSchema,
  // Total number of entries in the topic
  count: CountSchema,
  // Timestamp of the most recent write to the topic
  lastUpdated: FlexTimestampSchema,
});

export const SubscriptionSummarySchema = z.object({
  // URL of the remote content endpoint being replicated
  source: SourceUrlSchema,
  // Local topic receiving the replicated entries
  topic: TopicNameSchema,
  // How often the server polls the remote endpoint, in seconds
  frequency: FrequencySchema,
  // Timestamp when this subscription was first established
  created: FlexTimestampSchema,
});

export const ObjectEntrySchema = z.object({
  // Client-supplied string ID
  id: z.string().min(1),
  // Server-assigned monotonic write position; used for diff buckets and streaming cursor
  seq: z.number().int().positive(),
  // Timestamp when this entry was first written
  createdAt: TimestampSchema,
  // Timestamp of the most recent update to this entry
  updatedAt: TimestampSchema,
  // User-supplied payload; null indicates a tombstone
  payload: z.unknown().nullable(),
});

export const EventEntrySchema = z.object({
  // Server-assigned monotonically increasing integer ID
  id: z.number().int().positive(),
  // Timestamp when this entry was first written
  createdAt: TimestampSchema,
  // Timestamp of the most recent update to this entry
  updatedAt: TimestampSchema,
  // User-supplied payload; validated against the topic schema at write time
  payload: z.unknown(),
});

export const PaginationSchema = z.object({
  // ID of the first entry to return; omit to start from the beginning
  start: StartSchema.optional(),
  // Maximum entries to return; omit to use the server default
  size: SizeSchema.optional(),
});

// Entry ID coerced from a query string parameter; used in paginated endpoints
export const QueryStartSchema = z.coerce.number().int().positive();

// Page size coerced from a query string parameter; used in paginated endpoints
export const QuerySizeSchema = z.coerce.number().int().positive();

// JMESPath filter expression applied to each entry's payload; used in ?filter= lookups
export const QueryFilterSchema = z.string().min(1);

// Any JSON value except null; rejects undefined (missing key) and null.
// Falsy-but-valid JSON values (false, 0, "", []) are accepted — "non-null" means not JSON null.
export const JsonPayloadSchema = z.unknown().refine(
  (val) => val !== undefined && val !== null,
  { message: "payload must be a non-null JSON value" },
);

// SHA-256 hex digest — 64 lowercase hex characters
const HexHashRegex = /^[0-9a-f]{64}$/;
const HexHashMessage = "must be a 64-character lowercase hex string";
export const HexHashSchema = z.string().regex(HexHashRegex, HexHashMessage);

// One node in a Merkle diff request — covers IDs (start, end]; end must exceed start
export const MerkleNodeSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  hash: HexHashSchema,
}).refine((node) => node.end > node.start, {
  message: "end must be greater than start",
});

// Merkle diff request body — interactive reconciliation for both event and object topics
export const MerkleDiffBodySchema = z.object({
  nodes: z.array(MerkleNodeSchema).min(1).max(2000),
});

// Comma-separated list of entry IDs coerced from a query string parameter; used in ?ids= lookups
export const QueryIdsSchema = z.string()
  .transform((val) => val.split(",").map((segment) => parseInt(segment.trim(), 10)))
  .refine((ids) => ids.every((id) => Number.isInteger(id) && id > 0), {
    message: "ids must be a comma-separated list of positive integers",
  });
