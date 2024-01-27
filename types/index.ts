import { Context } from "https://deno.land/x/oak/mod.ts";
import { IAddActivity, IAddException, IStorage } from "./storage.ts";

export type { Request } from "https://deno.land/x/oak/mod.ts";
export * from "./auth.ts";
export * from "./storage.ts";

export type CSContext = Context & {
  state?: Record<string, any>;
  params?: Record<string, any>;
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

export interface ILogger extends IAddActivity, IAddException {}

export type Services = {
  storage: IStorage;
  logger: ILogger;
  schema: <T>(name: string, data: T, part: RequestPart) => void;
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
