import { OpineRequest } from "https://deno.land/x/opine/mod.ts";

/*
 * Topic information
 */
export type Topic = {
  name: string;
  description: string;
  created: string;
};

/*
 * Activity log information
 */
export type Activity<T> = {
  user: string;
  action: string;
  createdAt: string;
  metadata?: Record<string, T>;
};

export type CommonStorageRequest = OpineRequest & {
  requestId?: string;
  user?: string;
};

export type SupportedDB = "sqlite";

export type Permission = {
  route: string;
  methods: string[];
}

export type User = {
  password: string;
  permissions: Permission[]
}
