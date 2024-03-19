import type { Request } from "https://deno.land/x/oak@v12.6.2/mod.ts";
import { Application } from "https://deno.land/x/oak@v12.6.2/mod.ts";

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

export type Subscription = {
  source: string;
  target: string;
  serviceAccount: string;
  frequency: number;
};

export type SubscriptionState = {
  lastId: number | undefined;
};

export type Topic = {
  description: string;
  user: string;
  created: string;
  schema: any;
};

export interface IInfo {
  info(
    message: string,
    request: Request | undefined,
    data: Record<string, any>,
  ): Promise<void>;
}

export interface IError {
  error(
    message: string,
    request: Request | undefined,
    data: Record<string, any>,
  ): Promise<void>;
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
      description: string;
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
  addContent<T>(
    batchId: string | undefined,
    topic: string,
    content: T[],
  ): Promise<{
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

export interface IValidateContent {
  validateContent<T>(topic: string, content: T[]): Promise<void>;
}

export interface ISetSubscriptionState {
  setSubscriptionState(
    target: string,
    state: string,
    message: string,
  ): Promise<void>;
}

// Subscriptions
export interface IGetSubscription {
  getSubscription(id: string): Promise<Subscription | null>;
}

export interface IGetSubscriptionStats {
  getSubscriptionStats(topic: string): Promise<
    {
      topic: string;
    } | null
  >;
}

export interface IGetSubscriptionProgress {
  getSubscriptionProgress(
    topic: string,
  ): Promise<SubscriptionSyncProgress | null>;
}

export interface ISetSubscriptionProgress {
  setSubscriptionProgress(
    topic: string,
    progress: SubscriptionSyncProgress,
  ): Promise<void>;
}

export interface IGetSubscriptions {
  getSubscriptions(): Promise<Subscription[]>;
}

export interface IGetSubscriptionState {
  getSubscriptionState(id: string): Promise<SubscriptionState | null>;
}

export interface ISetLock {
  setLock(id: string): Promise<void>;
}

export interface IGetLock {
  getLock(id: string): Promise<number | null>;
}

export interface IDeleteLock {
  deleteLock(id: string): Promise<void>;
}

export interface IAddSubscription {
  addSubscription(
    subscription: string,
    target: string,
    serviceAccount: string,
    frequency: number,
  ): Promise<{ existed: boolean }>;
}

export enum SubscriptionSyncState {
  FIRST_CONTENT_FETCH_OK = "first_content_fetch_ok",
  SUBSCRIPTION_SAVED = "subscription_saved",
  FIRST_CONTENT_SAVED = "first_content_saved",
  CONTENT_SAVED = "content_saved",
  SYNC_COMPLETED = "sync_completed",
}

export type SubscriptionSyncProgress = {
  state: SubscriptionSyncState;
  startId: number;
};

export abstract class AIntertalk {
  abstract contentGet(
    topic: string,
    startId: number,
    username: string,
    password: string,
  ): Promise<Response>;
}

export type AppData = {
  app: Application;
  subscriptionsPid?: number;
};

export interface IStorage
  extends
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
    IAddBatch,
    IValidateContent,
    ISetSubscriptionState,
    IGetSubscription,
    ISetLock,
    IGetLock,
    IDeleteLock,
    IGetSubscriptionProgress,
    ISetSubscriptionProgress,
    IGetSubscriptions,
    IGetSubscriptionState,
    IAddSubscription {
  close(): Promise<void>;
}

export type SubscriptionStorage =
  & IGetUser
  & IGetRole
  & IGetTopic
  & IGetTopicStats
  & IGetSubscriptions
  & IGetLock
  & ISetLock
  & IDeleteLock
  & IGetSubscriptionProgress
  & ISetSubscriptionProgress
  & IGetSubscriptionState
  & ISetSubscriptionState
  & IAddContent
  & IAddSubscription
  & IValidateContent;

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
