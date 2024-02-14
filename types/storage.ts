import type { Request } from "https://deno.land/x/oak@v12.6.2/mod.ts";

import type { Permission, Role, User } from "./auth.ts";

export type Activity = {
  request: Request;
  message: string;
  metadata: Record<string, unknown>;
};

export type Content = {
  id: string;
  value: unknown;
  created: number;
};

export type Batch = {
  id: string;
  status: string;
  created?: number;
};

export type Topic = {
  title: string;
  description: string;
  created: string;
  schema: any;
};

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
  getTopicStats(topic: string): Promise<
    {
      topic: string;
      stats: {
        count: number;
        lastUpdated: number;
      };
    } | null
  >;
}

export interface IDeleteTopic {
  deleteTopic(topic: string): Promise<{ existed: boolean }>;
}

// Content

export interface IGetContent {
  getContent<T>(topic: string, startId?: number): Promise<{
    topic: string;
    startId: number | undefined;
    lastId: number | undefined;
    nextId: number | undefined;
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

type Row<T> = [(string | number)[], T];

export interface IStorageBackend {
  init(): Promise<void>;
  close(): Promise<void>;
  getValue<T>(table: string[], id?: string): Promise<T | null>;
  deleteValue(table: string[], id: string): Promise<void>;
  listTable<K, T>(
    table: string[],
    limit?: number,
  ): AsyncGenerator<{ key: K; value: T }>;
  setValue<T>(table: string[], id: string, value: T): Promise<void>;
  setValues<T>(rows: Row<T>[]): Promise<void>;
}
