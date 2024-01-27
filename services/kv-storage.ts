import Ajv from "https://esm.sh/ajv@8.12.0";

import { Activity, Batch, IStorage, Permission } from "../types/index.ts";
import { monotonicFactory } from "https://deno.land/x/ulid@v0.3.0/mod.ts";
import {
  BATCH_CLOSED,
  BATCH_MISSING,
  BATCH_OPEN,
} from "../shared/constants.ts";
import { RoleInUseError, TopicValidationError } from "../shared/errors.ts";

export class KVStorage implements IStorage {
  /*
   * KV Storage
   *
   * Uses Deno KV as a storage backend
   */
  kv: any;
  fpath: string | undefined;
  ulid: () => string;

  constructor(fpath: string | undefined) {
    this.kv = null;
    this.fpath = fpath;
    this.ulid = monotonicFactory();
  }

  async init() {
    this.kv = await Deno.openKv(this.fpath);
  }

  private assertInitialised() {
    if (!this.kv) {
      throw new Error("KV Storage not initialised");
    }
  }

  // +++ ACTIVITY +++ //

  async addActivity(actitity: Activity): Promise<void> {
    this.assertInitialised();
  }

  // +++ ERROR +++ //

  async addException(err: Error): Promise<void> {
    this.assertInitialised();
  }

  // +++ ROLE +++ //

  async getRole(role: string) {
    this.assertInitialised();

    const roleData = await this.kv.get(["roles", role]);
    if (roleData.value === null) {
      return null;
    }

    const {
      permissions,
      created,
    } = roleData.value;

    return {
      name: role,
      created,
      permissions,
    };
  }

  async deleteRole(role: string) {
    this.assertInitialised();

    // block deletion on user

    for await (const entry of this.kv.list({ prefix: ["users"] })) {
      const user = entry.value;

      if (user.role === role) {
        throw new RoleInUseError(
          `role "${role}" is in use by user "${user.name}"`,
        );
      }
    }

    const current = await this.kv.get(["roles", role]);
    await this.kv.delete(["roles", role]);

    return {
      existed: current.value !== null,
    };
  }

  async addRole(role: string, permissions: Permission[]) {
    this.assertInitialised();
    const current = await this.kv.get(["roles", role]);

    await this.kv.set(["roles", role], {
      name: role,
      permissions,
      created: Date.now(),
    });

    return {
      existed: current.value !== null,
    };
  }

  // +++ USER +++ //

  async getUser(user: string) {
    this.assertInitialised();

    const roleData = await this.kv.get(["users", user]);
    if (roleData.value === null) {
      return null;
    }

    const {
      name,
      role,
      password,
      created,
    } = roleData.value;

    return {
      name,
      role,
      password,
      created,
    };
  }

  async deleteUser(user: string) {
    this.assertInitialised();

    const current = await this.kv.get(["users", user]);
    await this.kv.delete(["users", user]);

    return {
      existed: current.value !== null,
    };
  }

  async addUser(user: string, role: string, password: string) {
    this.assertInitialised();
    const current = await this.kv.get(["users", user]);

    await this.kv.set(["users", user], {
      name: user,
      role,
      password,
      created: Date.now(),
    });

    return {
      existed: current.value !== null,
    };
  }

  // +++ TOPIC +++ //

  async getTopic(topic: string) {
    this.assertInitialised();

    const topicData = await this.kv.get(["topics", topic]);
    if (topicData.value === null) {
      return null;
    }

    const {
      description,
      schema,
      created,
    } = topicData.value;

    return {
      name: topic,
      description,
      schema,
      created,
    };
  }

  async addTopic(
    topic: string,
    user: string,
    description: string,
    schema: Record<string, any> | undefined,
  ) {
    const current = await this.kv.get(["topics", topic]);

    await this.kv.set(["topics", topic], {
      description,
      user,
      schema,
      created: Date.now(),
    });

    return {
      existed: current.value !== null,
    };
  }

  async getTopicNames(): Promise<string[]> {
    this.assertInitialised();

    const names: string[] = [];
    for await (const entry of this.kv.list({ prefix: ["topics"] })) {
      names.push(entry.key[1]);
    }

    return names;
  }

  async getTopicStats(topic: string) {
    const lastUpdated = await this.kv.get(["topic-last-updated", topic]);
    const count = await this.kv.get(["topic-count", topic]);

    return {
      topic: topic,
      stats: {
        count: count.value ?? 0,
        lastUpdated: lastUpdated.value,
      },
    };
  }

  async deleteTopic(topic: string): Promise<{ existed: boolean }> {
    const current = await this.kv.get(["topics", topic]);

    await this.kv.delete(["topics", topic]);

    return {
      existed: current.value !== null,
    };
  }

  // +++ CONTENT +++ //

  async addContent<T>(
    batchId: string | undefined,
    topic: string,
    content: T[],
  ): Promise<{ lastId: number }> {
    if (batchId) {
      let batch = await this.getBatch(batchId);

      if (batch.status === BATCH_MISSING) {
        await this.addBatch(batchId);
        batch = await this.getBatch(batchId);
      }

      if (batch.status === BATCH_CLOSED && content.length > 0) {
        throw new Error(`batch "${batchId}" is closed; cannot add content`);
      }

      // close the batch if there is no content, and we are using a batch
      if (content.length === 0) {
        await this.closeBatch(batchId);
      }
    }

    const topicData = await this.getTopic(topic);
    if (!topicData) {
      throw new Error(`topic "${topic}" does not exist`);
    }

    // validate the new content
    for (const entry of content) {
      if (!topicData.schema) {
        continue;
      }

      const ajv = new Ajv({ allErrors: true });
      const valid = ajv.validate(topicData.schema, entry);
      if (!valid) {
        const messages = (ajv.errors ?? []).map((err) => {
          return `- ${err.instancePath}: ${err.message}`;
        }).join("\n");

        throw new TopicValidationError(
          `Failed to validate content entry:\n${messages}`,
        );
      }
    }

    // set each entry consequetively
    let contentId = (await this.kv.get(["content-id"])).value;
    if (typeof contentId === "undefined" || contentId === null) {
      contentId = -1;
    }

    let topicCount = (await this.kv.get(["topic-count", topic]))?.value;
    if (typeof topicCount === "undefined" || topicCount === null) {
      topicCount = 0;
    }

    for (const entry of content) {
      contentId++;
      topicCount++;

      const now = Date.now();
      await this.kv.atomic()
        .set(["content-id"], contentId)
        .set(["topic-count", topic], topicCount)
        .set(["topic-last-updated", topic], now)
        .set(["content", topic, contentId], {
          batchId,
          topic,
          content: JSON.stringify(entry),
          created: now,
        })
        .commit();
    }

    return { lastId: contentId! };
  }

  async getContent<T>(topic: string, startId?: number): Promise<{
    topic: string;
    startId: number | undefined;
    lastId: number;
    nextId: number;
    content: T[];
  }> {
    let from = startId;
    let lastId;

    const listOptions = {
      prefix: ["content", topic],
      limit: 10,
    };

    const content: T[] = [];

    let size = 0;
    for await (const entry of this.kv.list(listOptions)) {
      const contentId = lastId = entry.key[2];

      if (from && contentId < from) {
        continue;
      } else if (typeof from === "undefined") {
        from = contentId;
      }

      content.push(JSON.parse(entry.value.content));
      size++;

      if (size >= 10) {
        break;
      }
    }

    const response = {
      topic,
      startId: from,
      lastId,
      nextId: lastId + 1,
      content,
    };

    return response;
  }

  // +++ CONTENT BATCHES +++ //
  async addBatch(batchId: string) {
    this.assertInitialised();
    const current = await this.kv.get(["batches", batchId]);

    await this.kv.set(["batches", batchId], {
      id: batchId,
      closed: false,
      created: Date.now(),
    });

    return {
      existed: current.value !== null,
    };
  }

  private async closeBatch(batchId: string) {
    this.assertInitialised();
    let current = await this.getBatch(batchId);

    if (current === null) {
      await this.addBatch(batchId);
      current = await this.getBatch(batchId);
    }

    await this.kv.set(["batches", batchId], {
      id: batchId,
      closed: true,
      created: current.created,
    });
  }

  async getBatch(batchId: string): Promise<Batch> {
    this.assertInitialised();

    const batchData = await this.kv.get(["batches", batchId]);
    if (batchData.value === null) {
      return {
        id: batchId,
        status: "missing",
      };
    }

    const {
      id,
      closed,
      created,
    } = batchData.value;

    const iso = (new Date(parseInt(created))).toISOString();

    return {
      id,
      status: closed ? BATCH_CLOSED : BATCH_OPEN,
      created: iso,
    };
  }

  async close() {
    await this.kv.close();
  }
}
