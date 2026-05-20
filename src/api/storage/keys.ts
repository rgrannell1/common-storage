// KV key prefix constants — define the namespace structure for all stored data

// Prefix for topic metadata entries: ["topic", <name>]
export const KV_TOPIC = ["topic"];

// Prefix for per-topic statistics: ["topic-stats", <name>]
export const KV_TOPIC_STATS = ["topic-stats"];

// Prefix for event topic entries: ["event", <topic>, <id>]
export const KV_EVENT = ["event"];

// Prefix for per-topic monotonic ID counters: ["event-counter", <topic>]
export const KV_EVENT_COUNTER = ["event-counter"];

// Prefix for object topic entries: ["object", <topic>, <id>]
export const KV_OBJECT = ["object"];

// Prefix for idempotency cache entries: ["idempotency", <topic>, <key>]
export const KV_IDEMPOTENCY = ["idempotency"];

// Prefix for per-IP rate-limit bucket counters: ["rate-limit", "ip", <ip>, <bucket-minute>]
export const KV_RATE_LIMIT_IP = ["rate-limit", "ip"];

// Prefix for global rate-limit bucket counters: ["rate-limit", "global", <bucket-minute>]
export const KV_RATE_LIMIT_GLOBAL = ["rate-limit", "global"];

// Bloom filter state for IP deduplication: ["bloom", "ip"]
export const KV_BLOOM_IP = ["bloom", "ip"];
