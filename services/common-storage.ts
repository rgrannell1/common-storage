import Ajv from "https://esm.sh/ajv@8.12.0";

import { Activity, Batch, IStorage, Permission } from "../types/index.ts";
import {
  BATCH_CLOSED,
  BATCH_MISSING,
  BATCH_OPEN,
} from "../shared/constants.ts";
import { RoleInUseError, TopicValidationError } from "../shared/errors.ts";
import { IStorageBackend } from "../types/storage.ts";
import { Role, User } from "../types/auth.ts";
import { Topic } from "../types/storage.ts";

export class CommonStorage implements IStorage {
  backend: IStorageBackend;

  constructor(backend: IStorageBackend) {
    this.backend = backend;
  }

  async init() {
    await this.backend.init();
  }

  // +++ ACTIVITY +++ //

  async addActivity(_: Activity): Promise<void> {
  }

  // +++ ERROR +++ //

  async addException(_: Error): Promise<void> {
  }

  // +++ ROLE +++ //

  async getRole(role: string) {
    const roleData = await this.backend.getValue<Role>(["roles"], role);
    if (roleData === null) {
      return null;
    }

    const {
      permissions,
      created,
    } = roleData;

    return {
      name: role,
      created,
      permissions,
    };
  }

  async deleteRole(role: string) {
    // block deletion on user

    for await (const entry of this.backend.listTable<string, User>(["users"])) {
      const user = entry.value;

      if (user.role === role) {
        throw new RoleInUseError(
          `role "${role}" is in use by user "${user.name}"`,
        );
      }
    }
    const current = await this.backend.getValue<Role>(["roles"], role);

    await this.backend.deleteValue(["roles"], role);

    return {
      existed: current !== null,
    };
  }

  async addRole(role: string, permissions: Permission[]) {
    const current = await this.backend.getValue(["roles"], role);

    await this.backend.setValue(["roles"], role, {
      name: role,
      permissions,
      created: Date.now(),
    });

    return {
      existed: current !== null,
    };
  }

  // +++ USER +++ //

  async getUser(user: string) {
    const roleData = await this.backend.getValue<User>(["users"], user);
    if (roleData === null) {
      return null;
    }

    const {
      name,
      role,
      password,
      created,
    } = roleData;

    return {
      name,
      role,
      password,
      created,
    };
  }

  async deleteUser(user: string) {
    const current = await this.backend.getValue(["users"], user);
    await this.backend.deleteValue(["users"], user);

    return {
      existed: current !== null,
    };
  }

  async addUser(user: string, role: string, password: string) {
    const current = await this.backend.getValue(["users"], user);

    await this.backend.setValue(["users"], user, {
      name: user,
      role,
      password,
      created: Date.now(),
    });

    return {
      existed: current !== null,
    };
  }

  // +++ TOPIC +++ //

  async getTopic(topic: string) {
    const topicData = await this.backend.getValue<Topic>(["topics"], topic);
    if (topicData === null) {
      return null;
    }

    const {
      description,
      schema,
      created,
    } = topicData;

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
    const current = await this.backend.getValue(["topics"], topic);

    await this.backend.setValue(["topics"], topic, {
      description,
      user,
      schema,
      created: Date.now(),
    });

    return {
      existed: current !== null,
    };
  }

  async getTopicNames(): Promise<string[]> {
    const names: string[] = [];
    for await (
      const entry of this.backend.listTable<string[2], unknown>(["topics"])
    ) {
      names.push(entry.key[1]);
    }

    return names;
  }

  async getTopicStats(topic: string) {
    const topicData = await this.backend.getValue<Topic>(["topics"], topic);
    if (topicData === null) {
      return null;
    }

    const lastUpdated = await this.backend.getValue<number>([
      "topic-last-updated",
    ], topic);
    const count = await this.backend.getValue<number>(["topic-count"], topic);

    // TODO bad
    return {
      topic: topic,
      stats: {
        count: count ?? 0,
        lastUpdated: lastUpdated!,
      },
    };
  }

  async deleteTopic(topic: string): Promise<{ existed: boolean }> {
    const current = await this.backend.getValue(["topics"], topic);

    await this.backend.deleteValue(["topics"], topic);

    return {
      existed: current !== null,
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
    let contentId = await this.backend.getValue<number>(["content-id"]);
    if (typeof contentId === "undefined" || contentId === null) {
      contentId = -1;
    }

    let topicCount = await this.backend.getValue<number>(
      ["topic-count"],
      topic,
    );
    if (typeof topicCount === "undefined" || topicCount === null) {
      topicCount = 0;
    }

    for (const entry of content) {
      contentId++;
      topicCount++;

      const now = Date.now();

      await this.backend.setValues<unknown>([
        [["content-id"], contentId],
        [["topic-count", topic], topicCount],
        [["topic-last-updated", topic], now],
        [["content", topic, contentId], {
          batchId,
          topic,
          content: JSON.stringify(entry),
          created: now,
        }],
      ]);
    }

    return { lastId: contentId! };
  }

  async getContent<T>(topic: string, startId?: number): Promise<{
    topic: string;
    startId: number | undefined;
    lastId: number | undefined;
    nextId: number | undefined;
    content: T[];
  }> {
    let from = startId;
    let lastId;

    const content: T[] = [];

    let size = 0;
    for await (
      const entry of this.backend.listTable<number[], { content: string }>([
        "content",
      ], 10)
    ) {
      const contentId = lastId = entry.key[2];

      if (from && contentId < from) {
        continue;
      } else if (typeof from === "undefined") {
        from = contentId;
      }

      content.push(JSON.parse(entry.value.content)); // TODO this looks far too specific
      size++;

      if (size >= 10) {
        break;
      }
    }

    const response = {
      topic,
      startId: from,
      lastId,
      nextId: lastId ? lastId + 1 : undefined,
      content,
    };

    return response;
  }

  // +++ CONTENT BATCHES +++ //
  async addBatch(batchId: string) {
    const current = await this.backend.getValue(["batches"], batchId);

    await this.backend.setValue<Batch>(["batches"], batchId, {
      id: batchId,
      status: BATCH_OPEN,
      created: Date.now(),
    });

    return {
      existed: current !== null,
    };
  }

  private async closeBatch(batchId: string) {
    let current = await this.getBatch(batchId);

    if (current === null) {
      await this.addBatch(batchId);
      current = await this.getBatch(batchId);
    }

    await this.backend.setValue(["batches"], batchId, {
      id: batchId,
      status: BATCH_CLOSED,
      created: current.created,
    });
  }

  // TODO types may be broken here
  async getBatch(batchId: string): Promise<Batch> {
    const batchData = await this.backend.getValue<Batch>(["batches"], batchId);
    if (batchData === null) {
      return {
        id: batchId,
        status: "missing",
      };
    }

    const {
      id,
      status,
      created,
    } = batchData;

    return {
      id,
      status: status === "closed" ? BATCH_CLOSED : BATCH_OPEN,
      created,
    };
  }

  async close() {
    await this.backend.close();
  }

  async [Symbol.asyncDispose]() {
    await this.close();
  }
}
