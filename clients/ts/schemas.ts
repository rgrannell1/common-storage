// Input validation schemas for CmstrClient — built from shared server scalar schemas
// @work.md

import { z } from "zod";
import {
  TopicNameSchema,
  StartSchema,
  SizeSchema,
  QueryFilterSchema,
} from "../../src/api/parsers/schemas.ts";

export const GetEventsInputSchema = z.object({
  topic: TopicNameSchema,
  start: StartSchema.optional(),
  size: SizeSchema.optional(),
  ids: z.array(z.number().int().positive()).min(1).optional(),
  filter: QueryFilterSchema.optional(),
});

export const GetEventInputSchema = z.object({
  topic: TopicNameSchema,
  id: z.number().int().positive(),
});

export const PostEventInputSchema = z.object({
  topic: TopicNameSchema,
  payload: z.unknown(),
  idempotencyKey: z.string().optional(),
});

export const PutEventInputSchema = z.object({
  topic: TopicNameSchema,
  id: z.number().int().positive(),
  payload: z.unknown(),
  idempotencyKey: z.string().optional(),
});

export const GetObjectsInputSchema = z.object({
  topic: TopicNameSchema,
  filter: QueryFilterSchema.optional(),
});

export const GetObjectInputSchema = z.object({
  topic: TopicNameSchema,
  id: z.string().min(1),
});

export const PutObjectInputSchema = z.object({
  topic: TopicNameSchema,
  id: z.string().min(1),
  payload: z.unknown(),
  idempotencyKey: z.string().optional(),
});

export const DeleteObjectInputSchema = z.object({
  topic: TopicNameSchema,
  id: z.string().min(1),
});

