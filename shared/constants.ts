/*
 * This file contains all the constants used in the application
 */

// Batch statuses
export const BATCH_MISSING = "missing";
export const BATCH_OPEN = "open";
export const BATCH_CLOSED = "closed";

export const RATE_LIMIT_WINDOW = 60_000;
export const RATE_LIMIT_MAX_IN_WINDOW = 180;
export const RATE_LIMIT_THROTTLE_DURATION = 300_000;

// Special roles
export const PERMISSIONLESS_ROLE = "PERMISSIONLESS";

// Topic namespaces for subscriptions
export const SUBSCRIPION_TOPIC_PREFIX = "subscription.";

// Subscription Statuses
export const SUBSCRIPTION_FAILED = "failed";
export const SUBSCRIPTION_OK = "ok";

//
export const SUBSCRIPTION_DELAY = 1_500;

// How long will we wait for a content get to a remote common-storage server?
export const CONTENT_GET_TIMEOUT = 10_000;

// the lock is updated every content fetch, which should be fairly quick
export const MAX_SUBSCRIPTION_LOCK_DURATION = 120_000;

// +++ +++ +++ Table Information +++ +++ +++

// Roles a user can have
export const TABLE_ROLES = "roles";

// Users and credentials
export const TABLE_USERS = "users";

// Topics and their descriptions
export const TABLE_TOPICS = "topics";

// Subscription sources and targets
export const TABLE_SUBSCRIPTIONS = "subscriptions";
export const TABLE_SUBSCRIPTION_STATE = "subscription-state";

// Locks held by the system
export const TABLE_LOCKS = "lock";

// Content data
export const TABLE_CONTENT = "content";

// Content batch information
export const TABLE_BATCHES = "batches";

// The progress of a subscription
export const TABLE_SUBSCRIPTIONS_PROGRESS = "subscriptions-progress";

// The overall content-id for common-storage
export const TABLE_CONTENT_ID = "content-id";

// The last time a ticket was updated
export const TABLE_TOPIC_LAST_UPDATED = "topic-last-updated";

// The number of entries for a topic
export const TABLE_TOPIC_COUNT = "topic-count";

// The last id retrieved for a subscription
export const TABLE_SUBSCRIPTION_LAST_ID = "subscription-last-id";

// The common-storage feed version
export const COMMON_STORAGE_VERSION = "v0.1";

// How many records can be retrieved at once?
export const DEFAULT_PAGE_SIZE = 50;
