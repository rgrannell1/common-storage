// How many entries should be returned per page when fetching content
export const DEFAULT_SIZE = "20";

// Retry after this many milliseconds
export const RETRY_MS = 5_000;

// Poll for things to retry at this interval
export const RETRY_INTERVAL_MS = 1_000;

// The smallest allowed timeout for a subscription notify
export const MINIMUM_TIMEOUT_MS = 1_000;

// The longest allowed timeout for a subscription notify
export const DEFAULT_TIMEOUT_MS = 30_000;
