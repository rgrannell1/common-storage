/*
 * This file contains all the constants used in the application
 */

// Batch statuses
export const BATCH_MISSING = "missing";
export const BATCH_OPEN = "open";
export const BATCH_CLOSED = "closed";

export const RATE_LIMIT_WINDOW = 60_000;
export const RATE_LIMIT_MAX_IN_WINDOW = 120;
export const RATE_LIMIT_THROTTLE_DURATION = 300_000;

// Special roles
export const PERMISSIONLESS_ROLE = "PERMISSIONLESS";

// Namespaces
export const SUBSCRIPION_TOPIC_PREFIX = "subscription.";

// Subscription Statuses
export const SUBSCRIPTION_FAILED = "failed";
export const SUBSCRIPTION_OK = "ok";

//
export const SUBSCRIPTION_DELAY = 3_000;