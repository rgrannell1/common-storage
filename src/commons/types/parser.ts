// Parser types for request and response validation pipelines

import type { Result } from "./result.ts";

export type RequestParts<Body> = {
  headers: Headers;
  url: URL;
  body: Body;
  params: Record<string, string>;
};

export type RequestParser<Parsed, Body, Failure> = (parts: RequestParts<Body>) => Result<Parsed, Failure>;

export type ResponseParser<Parsed, Failure> = (value: unknown) => Result<Parsed, Failure>;

export type RouteHandler<Params, Output, Failure> = (params: Params) => Promise<Result<Output, Failure>>;

export type Route<Body, Params, HandlerOutput, ResponseOutput, Failure> = {
  parseRequest: RequestParser<Params, Body, Failure>;
  handle: RouteHandler<Params, HandlerOutput, Failure>;
  parseResponse: ResponseParser<ResponseOutput, Failure>;
};
