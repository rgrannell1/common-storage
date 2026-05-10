// Route response types — success and error cases unified under a single discriminated union

export type RouteError =
  | { kind: "parse_request"; field: string; message: string }
  | { kind: "not_found"; resource: string }
  | { kind: "internal"; message: string };

export type RouteSuccess =
  | { kind: "ok"; body: unknown }
  | { kind: "created"; body: unknown }
  | { kind: "no_content" }
  | { kind: "stream"; stream: ReadableStream<unknown> };

export type RouteResponse = RouteError | RouteSuccess;
