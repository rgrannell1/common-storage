// Shared constants for common-storage — configuration paths and reserved names

// XDG config subdirectory name for common-storage
export const CONFIG_DIR_NAME = "common-storage";

// Filename of the JSON config file within the config directory
export const CONFIG_FILE_NAME = "config.json";

// Reserved topic name the server writes its own metrics into
export const METRICS_TOPIC = "common-storage";

// Default port the HTTP server listens on
export const DEFAULT_PORT = 2400;

// Default host address the server binds to
export const DEFAULT_HOST = "0.0.0.0";

// Name of the systemd user service unit
export const SYSTEMD_SERVICE_NAME = "common-storage";

// Default number of entries returned by paginated content endpoints
export const DEFAULT_PAGE_SIZE = 100;

// Route path segments that carry a :topic parameter — used by auth middleware to extract the topic
export const TOPIC_ROUTE_PREFIXES = ["events", "objects", "diff"] as const;

// Valid HTTP methods used across route registration and config token caveats
export const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE"] as const;

// Milliseconds per second — used to convert frequency values from seconds to milliseconds
export const MS_PER_SECOND = 1_000;

// How often the metrics emitter snapshots and writes to the metrics topic, in milliseconds
export const METRICS_INTERVAL_MS = 60_000;

// Object ID for the metrics snapshot — always overwritten; topic holds one live record
export const METRICS_OBJECT_ID = "latest";

// How long to wait between stream polls when no new entries are found, in milliseconds
export const STREAM_POLL_INTERVAL_MS = 1_000;

// Duration to tail remote NDJSON stream after a diff round-trip, in milliseconds
export const TAIL_DURATION_MS = 5_000;

// Page size used when fetching entries in bulk (full fetch and range fetch)
export const DEFAULT_FETCH_PAGE_SIZE = 500;

// Number of entries per Merkle leaf node; leaf hashes cover IDs (start, start + MERKLE_LEAF_SIZE]
export const MERKLE_LEAF_SIZE = 100;

// Total ID/seq space the Merkle tree covers; MERKLE_LEAF_SIZE * 2^20 gives exactly 20 levels with 100-entry leaves
export const MERKLE_TREE_END = MERKLE_LEAF_SIZE * (1 << 20);

// Depth of the Merkle tree — number of levels from root to leaf (inclusive of both)
export const MERKLE_TREE_DEPTH = 20;

// Environment variable name holding the Macaroon root key
export const ROOT_KEY_ENV_VAR = "COMMON_STORAGE_ROOT_KEY";

// Maximum JSON-encoded payload size in bytes; Deno KV hard-limits stored values at 65536 bytes
export const MAX_PAYLOAD_BYTES = 60_000;

// Maximum byte length of an Idempotency-Key header value; keeps the KV key well under Deno KV's 2KB total key limit
export const MAX_IDEMPOTENCY_KEY_BYTES = 512;

// Tombstones older than this are eligible for GC
export const TOMBSTONE_RETENTION_MS = 24 * 60 * 60 * 1_000;

// Cron schedule for the metrics emitter — every minute
export const METRICS_CRON = "* * * * *";

// Cron schedule for the tombstone GC sweep — daily at midnight
export const GC_CRON = "0 0 * * *";

// Cron job name for the tombstone GC sweep
export const GC_CRON_NAME = "cmstr-gc";

// Env var name to override the config file path; useful on Deno Deploy where XDG paths do not exist
export const CMSTR_CONFIG_PATH_ENV_VAR = "CMSTR_CONFIG_PATH";

// KV key prefix for persisted metrics counters (total, byMethod, byStatus)
export const METRICS_COUNTERS_KEY = ["metrics", "counters"];

// KV key prefix for per-minute request count buckets; suffixed with the minute timestamp
export const METRICS_BUCKET_PREFIX = ["metrics", "bucket"];

// TTL for per-minute metric buckets — 1 day in milliseconds
export const METRICS_BUCKET_TTL_MS = 24 * 60 * 60 * 1_000;

// Idempotency cache namespace for POST /events/:topic
export const IDEMPOTENCY_NS_POST_EVENT = "post-event";

// Idempotency cache namespace for PUT /events/:topic/:id
export const IDEMPOTENCY_NS_PUT_EVENT = "put-event";

// Idempotency cache namespace for PUT /objects/:topic/:id
export const IDEMPOTENCY_NS_PUT_OBJECT = "put-object";

// Milliseconds per minute — used to map timestamps to minute-aligned bucket starts
export const MS_PER_MINUTE = 60_000;

// Content-Type header value for NDJSON streaming responses
export const NDJSON_CONTENT_TYPE = "application/x-ndjson";

// Byte width of a uint64 value in packed big-endian hashing buffers
export const UINT64_BYTES = 8;

// Byte width of a SHA-256 digest — used when packing bucket hashes into a root hash buffer
export const SHA256_BYTES = 32;

// Default per-IP request limit per rate-limit sliding window
export const DEFAULT_IP_LIMIT = 180;

// Default global request limit per rate-limit sliding window
export const DEFAULT_GLOBAL_LIMIT = 10_000;

// Width of each rate-limit time bucket in milliseconds
export const RATE_LIMIT_BUCKET_MS = 60_000;

// Maximum request body size in bytes accepted by the body-limit middleware; bodies exceeding this are rejected with 413
export const MAX_REQUEST_BODY_BYTES = 128 * 1_024;

// TTL for idempotency cache entries in KV; after this window a retry key may re-execute the operation
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1_000;

// Seconds browsers may cache CORS preflight responses; reduces OPTIONS round-trips on repeated cross-origin calls
export const CORS_MAX_AGE_SECONDS = 3600;

// Rate window widths in minutes used by the metrics collector snapshot
export const METRICS_RATE_WINDOW_1M_MINUTES = 1;
export const METRICS_RATE_WINDOW_5M_MINUTES = 5;
export const METRICS_RATE_WINDOW_1H_MINUTES = 60;
export const METRICS_RATE_WINDOW_1D_MINUTES = 1440;
