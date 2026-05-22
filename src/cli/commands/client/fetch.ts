// HTTP fetch helpers for the cs http client

import { type ResolvedServer } from "./server.ts";

// Builds Authorization and optional Content-Type headers for a server request
function buildHeaders(server: ResolvedServer, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${server.token}`,
    Accept: "application/json",
  };
  if (hasBody) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

// Reads the response body, prints it on success, and exits non-zero on HTTP error
async function handleResponse(response: Response): Promise<void> {
  const text = await response.text();
  if (!response.ok) {
    console.error(`HTTP ${response.status}: ${text}`);
    Deno.exit(1);
  }
  console.log(text);
}

// Makes a fetch to the server with Bearer auth; delegates response handling to handleResponse
export async function apiFetch(
  server: ResolvedServer,
  path: string,
  method: string,
  body?: unknown,
): Promise<void> {
  const url = `${server.url}${path}`;
  const headers = buildHeaders(server, body !== undefined);
  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  await handleResponse(response);
}
