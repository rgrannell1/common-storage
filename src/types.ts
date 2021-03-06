import { IStorage } from "./interfaces.ts";

export type Topic = {
  name: string;
  createdOn: string;
};
export type Topics = Record<string, Topic>;

export type Subscription = {
  id: string;
  topic: string;
  hookUrl: string;
  state?: string;
  lastNotifyAttempt?: string;
};

export type Subscriptions = Record<string, Subscription>;

export type Route = (
  cfg: any,
) => (req: any, res: any, next?: any) => Promise<unknown>;

export type Routes = {
  common: Record<string, Route>;
  feed: Record<string, Route>;
  subscriptions: Record<string, Route>;
  subscription: Record<string, Route>;
  topic: Record<string, Route>;
  content: Record<string, Route>;
  notify: Record<string, Route>;
};

export type Content = {
  event: Event;
  id: number;
};

export type Contents = Record<string, Content[]>;

export type Config = {
  title: string;
  description: string;
  storage: IStorage;
  port: number;
  user: {
    name: string;
    password: string;
  };
};

export type Batch = {
  topic: string;
  events: Event[];
};
export type Batches = Record<string, Batch>;

export type Event = {
  type: string;
  data: Record<string, any>;
  id?: number;
};

export type Retry = {
  subscription: Subscription;
  after: number;
};

export type Retries = Record<string, Retry>;
