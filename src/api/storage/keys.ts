// KV key prefix constants — define the namespace structure for all stored data

// Prefix for topic metadata entries: ["topic", <name>]
export const KV_TOPIC = ["topic"];

// Prefix for per-topic statistics: ["topic-stats", <name>]
export const KV_TOPIC_STATS = ["topic-stats"];

// Prefix for event topic entries: ["content", <topic>, <id>]
export const KV_CONTENT = ["content"];

// Prefix for per-topic monotonic ID counters: ["content-counter", <topic>]
export const KV_CONTENT_COUNTER = ["content-counter"];
