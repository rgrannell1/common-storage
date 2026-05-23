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

// Bucket width for event topic diff requests; integer ID space divided into fixed ranges
export const DEFAULT_EVENT_BUCKET_SIZE = 500;

// Bucket width for object topic diff requests; seq space divided into fixed ranges
export const DEFAULT_OBJECT_BUCKET_SIZE = 50;

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
