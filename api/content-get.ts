import { readableStreamFromAsyncIterator } from "https://deno.land/std@0.81.0/io/streams.ts";
import {
  JSONLinesStringifyStream,
} from "https://deno.land/x/jsonlines@v1.2.1/js/mod.js";

import { Status } from "../shared/status.ts";
import type {
  Config,
  IGetAllContent,
  IGetContent,
  IGetTopic,
  ILogger,
  SchemaValidator,
} from "../types/index.ts";
import { RequestPart } from "../types/index.ts";
import { ParamsParsers } from "../services/parsers.ts";
import { DEFAULT_PAGE_SIZE } from "../shared/constants.ts";

type Services = {
  storage: IGetTopic & IGetContent & IGetAllContent;
  logger: ILogger;
  schema: SchemaValidator;
};

type GetContentConfig = Partial<Config>;

/*
 * SSE's don't support authentication, which we'd like. That's ok,
 * We will progressively stream compressed JSON nd to the client instead.
 */
async function getContentStream(
  ctx: any,
  storage: Services["storage"],
  params: { topic: string; startId: number },
) {
  const contentStream = readableStreamFromAsyncIterator(
    storage.getAllContent(params.topic, params.startId),
  )
    .pipeThrough(new JSONLinesStringifyStream())
    .pipeThrough(new TextEncoderStream())
    .pipeThrough(new CompressionStream("gzip"));

  ctx.response.body = contentStream;

  ctx.response.headers.set("Content-Encoding", "gzip");
  ctx.response.headers.set("Content-Type", "application/x-ndjson");
}

async function getContentList(
  ctx: any,
  storage: Services["storage"],
  params: any,
) {
  // normal `application/json` handling
  const content = await storage.getContent(
    params.topic,
    ParamsParsers.startId(params.startId),
    params.size,
  );

  ctx.response.status = Status.OK;
  ctx.response.body = JSON.stringify(content);
}

export function getContent(_: GetContentConfig, services: Services) {
  const { storage, logger, schema } = services;

  return async function (ctx: any) {
    const params = {
      ...ctx.params,
      startId: ctx.request.url.searchParams.get("startId"),
      size: ctx.request.url.searchParams.get("size") ?? DEFAULT_PAGE_SIZE,
    };
    schema("contentGet", params, RequestPart.Params);

    const { topic } = params;

    if (
      !ctx.request.accepts("application/json") &&
      !ctx.request.accepts("application/x-ndjson")
    ) {
      ctx.response.status = Status.UnsupportedMediaType;
      ctx.response.body =
        "Only content-type 'application/json' (data list) or 'application/x-ndjson' (data stream) are supported";
      return;
    }

    if (
      ctx.request.accepts("application/x-ndjson") &&
      !ctx.request.accepts("gzip")
    ) {
      ctx.response.status = Status.UnsupportedMediaType;
      ctx.response.body =
        "Only content-encoding 'gzip' is supported for 'application/x-ndjson'";
      return;
    }

    if (ctx.request.accepts("application/x-ndjson")) {
      await logger.info("getting content stream", ctx.request, { topic });
      return await getContentStream(ctx, storage, params);
    } else {
      await logger.info("getting content list", ctx.request, { topic });
      return await getContentList(ctx, storage, params);
    }
  };
}
