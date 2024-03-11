import { Context } from "https://deno.land/x/oak@v12.6.2/mod.ts";
import { IError, IInfo, IStorage } from "./storage.ts";

import { IntertalkClient } from "../services/intertalk.ts";

export type { Request } from "https://deno.land/x/oak@v12.6.2/mod.ts";
export * from "./auth.ts";
export * from "./storage.ts";

export type CSContext = Context & {
  state?: Record<string, any>;
  params?: Record<string, any>;
};

export type Topic = {
  title: string;
  description: string;
  created: string;
  schema: object;
};

export enum RequestPart {
  Body,
  Params,
}

export type SchemaValidator = <T>(
  name: string,
  data: T,
  part: RequestPart,
) => void;

export interface ILogger extends IInfo, IError {}

export type Services = {
  storage: IStorage;
  logger: ILogger;
  schema: <T>(name: string, data: T, part: RequestPart) => void;
  intertalk: any;
};

export type Config = {
  port: number;
  title: string;
  logger: string;
  kvPath: string | undefined;
  description: string;
  adminUsername: string;
  adminPassword: string;
};
