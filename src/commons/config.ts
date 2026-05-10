// Config schema and derived types for the common-storage server

import { z } from "zod";

const HttpMethod = z.enum(["GET", "POST", "PUT", "DELETE"]);

const ServerConfig = z.object({
  // Port the HTTP server listens on
  port: z.number().int().min(1).max(65535),
  // Host address to bind to; defaults to 0.0.0.0
  host: z.string().optional(),
});

const SchemasConfig = z.object({
  // Path to folder of JSON Schema files for event topics
  events: z.string().optional(),
  // Path to folder of JSON Schema files for object topics
  objects: z.string().optional(),
});

const SubscriptionConfig = z.object({
  // URL of the content endpoint on the remote server
  source: z.string().url(),
  // Local topic name to write synced entries into
  topic: z.string().min(1).max(128),
  // Poll frequency in seconds; minimum 60
  frequency: z.number().int().min(60),
  // Env var name holding the bearer token for the remote server
  token: z.string(),
});

const TokenCaveatsConfig = z.object({
  // Topic this token may access; omit to allow all topics
  topic: z.string().min(1).max(128).optional(),
  // HTTP methods this token may use; omit to allow all methods
  methods: z.array(HttpMethod).optional(),
});

const TokenConfig = z.object({
  // Unique name used with `cs mint <name>`
  name: z.string().min(1).max(128),
  // Caveat restrictions attached to this token
  caveats: TokenCaveatsConfig,
});

const AliasConfig = z.object({
  // Short name used in CLI commands to reference this server
  name: z.string().min(1).max(64),
  // Base URL of the remote common-storage server
  url: z.string().url(),
});

export const Config = z.object({
  // HTTP server settings
  server: ServerConfig,
  // Name of the env var holding the Macaroon root key
  rootKey: z.string(),
  // Paths to topic schema folders
  schemas: SchemasConfig.optional(),
  // Remote topics to sync down periodically
  subscriptions: z.array(SubscriptionConfig).optional(),
  // Named token definitions for `cs mint`
  tokens: z.array(TokenConfig).optional(),
  // Named server URL aliases for the CLI client
  aliases: z.array(AliasConfig).optional(),
});

export type Config = z.infer<typeof Config>;
export type TokenConfig = z.infer<typeof TokenConfig>;
export type TokenCaveatsConfig = z.infer<typeof TokenCaveatsConfig>;
export type SubscriptionConfig = z.infer<typeof SubscriptionConfig>;
export type AliasConfig = z.infer<typeof AliasConfig>;
