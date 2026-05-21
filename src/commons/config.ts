// Config schema and derived types for the common-storage server

import { z } from "zod";
import { HTTP_METHODS } from "./constants.ts";

const HttpMethod = z.enum(HTTP_METHODS);

const ServerConfig = z.object({
  // Port the HTTP server listens on
  port: z.number().int().min(1).max(65535),
  // Host address to bind to; defaults to 0.0.0.0
  host: z.string().optional(),
});

// A single event or object topic declaration
const TopicConfig = z.object({
  // Unique name for this topic, used in API paths
  name: z.string().min(1).max(128),
  // Path to a JSON Schema file for payload validation; any JSON accepted if omitted
  schema: z.string().optional(),
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
  // ISO 8601 datetime after which this token is invalid, e.g. "2026-12-31T00:00"
  expires: z.string().optional(),
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
  // Event topics — ordered logs with server-assigned integer IDs
  events: z.array(TopicConfig).optional(),
  // Object topics — keyed dictionaries with user-supplied string IDs
  objects: z.array(TopicConfig).optional(),
  // Remote topics to sync down periodically
  subscriptions: z.array(SubscriptionConfig).optional(),
  // Named token definitions for `cs mint`
  tokens: z.array(TokenConfig).optional(),
  // Named server URL aliases for the CLI client
  aliases: z.array(AliasConfig).optional(),
});

export type Config = z.infer<typeof Config>;
export type TopicConfig = z.infer<typeof TopicConfig>;
export type TokenConfig = z.infer<typeof TokenConfig>;
export type TokenCaveatsConfig = z.infer<typeof TokenCaveatsConfig>;
export type SubscriptionConfig = z.infer<typeof SubscriptionConfig>;
export type AliasConfig = z.infer<typeof AliasConfig>;

// Parses and validates config text; returns human-readable error strings, or an empty array on success.
export function validateConfigText(text: string): string[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (parseErr) {
    return [`Not valid JSON: ${parseErr}`];
  }
  const result = Config.safeParse(raw);
  if (result.success) return [];
  return result.error.errors.map(zodErr => `${zodErr.path.join(".")}: ${zodErr.message}`);
}

// Reads config text from path: runs it as a subprocess if executable, reads it as a file otherwise.
// Mirrors the Ansible dynamic-inventory pattern — static and generated configs share the same interface.
export async function readConfigText(path: string): Promise<string> {
  const info = await Deno.stat(path);
  const isExecutable = info.mode !== null && (info.mode & 0o100) !== 0;

  if (!isExecutable) {
    return Deno.readTextFile(path);
  }

  const command = new Deno.Command(path, { stdout: "piped", stderr: "inherit" });
  const output = await command.output();

  if (!output.success) {
    throw new Error(`Config executable '${path}' exited with code ${output.code}`);
  }

  return new TextDecoder().decode(output.stdout);
}

export async function loadConfig(path: string): Promise<Config> {
  const text = await readConfigText(path);
  return Config.parse(JSON.parse(text));
}
