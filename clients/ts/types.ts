// Public types for CmstrClient — response shapes and input types
// @work.md

import { z } from "zod";
import {
  EventEntrySchema,
  ObjectEntrySchema,
  TopicSummarySchema,
  SubscriptionSummarySchema,
} from "../../src/api/parsers/schemas.ts";
import {
  GetEventsInputSchema,
  GetEventInputSchema,
  PostEventInputSchema,
  PutEventInputSchema,
  GetObjectsInputSchema,
  GetObjectInputSchema,
  PutObjectInputSchema,
  DeleteObjectInputSchema,
} from "./schemas.ts";

export type TopicSummary = z.infer<typeof TopicSummarySchema>;
export type SubscriptionSummary = z.infer<typeof SubscriptionSummarySchema>;
export type EventEntry = z.infer<typeof EventEntrySchema>;
export type ObjectEntry = z.infer<typeof ObjectEntrySchema>;

export type FeedResponse = {
  topics: TopicSummary[];
  subscriptions: SubscriptionSummary[];
};

export type EventsResponse = {
  entries: EventEntry[];
  next: number | null;
};

export type GetEventsInput = z.infer<typeof GetEventsInputSchema>;
export type GetEventInput = z.infer<typeof GetEventInputSchema>;
export type PostEventInput = z.infer<typeof PostEventInputSchema>;
export type PutEventInput = z.infer<typeof PutEventInputSchema>;
export type GetObjectsInput = z.infer<typeof GetObjectsInputSchema>;
export type GetObjectInput = z.infer<typeof GetObjectInputSchema>;
export type PutObjectInput = z.infer<typeof PutObjectInputSchema>;
export type DeleteObjectInput = z.infer<typeof DeleteObjectInputSchema>;

export type CmstrClientConfig = {
  url: string;
  token: string;
};
