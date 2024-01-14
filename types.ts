import { Context, Request } from "https://deno.land/x/oak/mod.ts";

export type { Request } from "https://deno.land/x/oak/mod.ts";
export type Activity = {
  request: Request;
  message: string;
  metadata: Record<string, unknown>;
};

export type CSContext = Context & {
  state?: Record<string, any>;
  params?: Record<string, any>;
};

// ++ ++ //

export type Role = {
  name: string;
  created: string;
  permissions: Permission[];
};

export type User = {
  name: string;
  role: string;
  password: string;
  created: string;
};

export type Permission = {
  routes: string | string[];
  topics: string | string[];
};

export type Content = {
  id: string;
  value: unknown;
  created: string;
};

export type Batch = {
  id: string;
  status: string;
  created?: string;
};

export enum RequestPart {
  Body,
  Params,
}

// ++ Functions ++ //

export type SchemaValidator = <T>(
  name: string,
  data: T,
  part: RequestPart,
) => void;

// +++ Interfaces +++ //

export interface ILogger {
  addActivity(activity: Activity): Promise<void>;
  addException(err: Error): Promise<void>;
}

// Exceptions
export interface IAddException {
  addException(err: Error): Promise<void>;
}

// Activity
export interface IAddActivity {
  addActivity(activity: Activity): Promise<void>;
}

// Role

export interface IGetRole {
  getRole(role: string): Promise<Role | null>;
}

export interface IDeleteRole {
  deleteRole(role: string): Promise<{ existed: boolean }>;
}

export interface IAddRole {
  addRole(
    name: string,
    permissions: Permission[],
  ): Promise<{ existed: boolean }>;
}

// User

export interface IGetUser {
  getUser(name: string): Promise<User | null>;
}

export interface IDeleteUser {
  deleteUser(name: string): Promise<{ existed: boolean }>;
}

export interface IAddUser {
  addUser(
    name: string,
    role: string,
    password: string,
  ): Promise<{ existed: boolean }>;
}

// Topic

export interface IGetTopic {
  getTopic(topic: string): Promise<
    {
      name: string;
      description: string;
      created: string;
    } | null
  >;
}

export interface IAddTopic {
  addTopic(
    topic: string,
    user: string,
    description: string,
    schema: any,
  ): Promise<{
    existed: boolean;
  }>;
}

export interface IGetTopicNames {
  getTopicNames(): Promise<string[]>;
}

export interface IGetTopicStats {
  getTopicStats(topic: string): Promise<{
    topic: string;
    stats: {
      count: number;
      lastUpdated: number;
    };
  }>;
}

export interface IDeleteTopic {
  deleteTopic(topic: string): Promise<{ existed: boolean }>;
}

// Content

export interface IGetContent {
  getContent<T>(topic: string, startId?: number): Promise<{
    topic: string;
    startId: number | undefined;
    lastId: number;
    nextId: number;
    content: T[];
  }>;
}

export interface IAddContent {
  addContent<T>(topic: string, batchId: string, content: T[]): Promise<{
    lastId: number;
  }>;
}

// Content Batches

export interface IGetBatch {
  getBatch(batch: string): Promise<Batch>;
}

export interface IAddBatch {
  addBatch(batch: string): Promise<{ existed: boolean }>;
}

export interface IStorage
  extends
    IAddActivity,
    IAddException,
    IGetRole,
    IAddRole,
    IDeleteRole,
    IAddUser,
    IGetUser,
    IDeleteUser,
    IAddTopic,
    IGetTopic,
    IGetTopicNames,
    IGetTopicStats,
    IDeleteTopic,
    IGetContent,
    IAddContent,
    IGetBatch,
    IAddBatch {}

export interface ILogger extends IAddActivity, IAddException {}

// ++

export type Services = {
  storage: IStorage;
  logger: ILogger;
  schema: <T>(name: string, data: T, part: RequestPart) => void;
};

export type Config = {
  port: number;
  title: string;
  logger: string;
  description: string;
  adminUsername: string;
  adminPassword: string;
};

export enum AdminAuthenticationState {
  MissingConfiguration,
  InvalidHeader,
  IncorrectCredentials,
  Authenticated,
}

export enum RoleAuthenticationState {
  AdminUser,
  MissingConfiguration,
  InvalidHeader,
  IncorrectCredentials,
  Authenticated,
  UserNotRegistered,
  RoleMissing,
  NotAuthorised,
}
