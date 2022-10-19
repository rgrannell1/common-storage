import { Client } from "https://deno.land/x/postgres@v0.16.1/mod.ts";
import type { Topic } from "../../types/types.ts";
import type {
  AddContentResponse,
  AddTopicResponse,
  GetTopicStatsResponse,
} from "../.././types/interfaces/storage.ts";
import type { IStorage } from "../.././types/interfaces/storage.ts";

export class Mongo implements IStorage {
  #loaded: boolean;

  constructor(cfg: Record<string, any>) {
    this.#loaded = true;
  }

  async init() {
  }

  assertLoaded() {
  }

  async getTopic(topic: string): Promise<Topic> {
  }

  async getTopicStats(topic: string): Promise<GetTopicStatsResponse> {
  }

  async #closeBatch(batchId: string) {
  }

  async getBatch(batchId: string) {
  }

  async addBatch(batchId: string) {
  }

  async getContent(topic: string, startId: string | undefined) {
  }

  async addContent(
    batchId: string,
    topic: string,
    content: any[],
  ): Promise<AddContentResponse> {
  }

  async cleanup() {
  }

  close() {
  }
}
