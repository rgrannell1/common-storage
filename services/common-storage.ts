import Ajv from "https://esm.sh/ajv@8.12.0";

import { Activity, Batch, IStorage, Permission } from "../types/index.ts";
import {
  BATCH_CLOSED,
  BATCH_MISSING,
  BATCH_OPEN,
  SUBSCRIPION_TOPIC_PREFIX,
} from "../shared/constants.ts";
import {
  BatchClosedError,
  RoleInUseError,
  TopicNotFoundError,
  TopicValidationError,
} from "../shared/errors.ts";
import { IStorageBackend } from "../types/storage.ts";
import { Role, User } from "../types/auth.ts";
import { Subscription, Topic } from "../types/storage.ts";
import * as bcrypt from "https://deno.land/x/bcrypt/mod.ts";
import { SubscriptionSyncProgress } from "../types/storage.ts";

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
      // TODO this is horrible. Only store this credential if we are creating a service-account
      password,
      hash: bcrypt.hashSync(password),
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
      user,
      description,
      schema,
      created,
    } = topicData;

    return {
      user,
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
      description: topicData.description,
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

  async validateContent<T>(topic: string, content: T[]) {
    const topicData = await this.getTopic(topic);
    if (!topicData) {
      throw new TopicNotFoundError(`topic "${topic}" does not exist`);
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
  }

  async #updateBatch<T>(batchId: string, content: T[]) {
    let batch = await this.getBatch(batchId);

    if (batch.status === BATCH_MISSING) {
      await this.addBatch(batchId);
      batch = await this.getBatch(batchId);
    }

    if (batch.status === BATCH_CLOSED && content.length > 0) {
      throw new BatchClosedError(
        `batch "${batchId}" is closed; cannot add content`,
      );
    }

    // close the batch if there is no content, and we are using a batch
    if (content.length === 0) {
      await this.closeBatch(batchId);
    }
  }

  async #getTopicMetadata(topic: string) {
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

    let subscriptionLastId = await this.backend.getValue<number>(
      ["subscription-last-id"],
      topic,
    );
    if (
      typeof subscriptionLastId === "undefined" || subscriptionLastId === null
    ) {
      subscriptionLastId = -1;
    }

    return { contentId, topicCount, subscriptionLastId };
  }

  async addContent<T>(
    batchId: string | undefined,
    topic: string,
    content: T[],
  ): Promise<{ lastId: number }> {
    if (batchId) {
      await this.#updateBatch(batchId, content);
    }

    await this.validateContent(topic, content);

    let { contentId, topicCount, subscriptionLastId } = await this
      .#getTopicMetadata(topic);

    for (const entry of content) {
      contentId++;
      topicCount++;

      const now = Date.now();

      const atomicDataUpdate = [
        [["content-id"], contentId],
        [["topic-count", topic], topicCount],
        [["topic-last-updated", topic], now],
        [["content", topic, contentId], {
          batchId,
          topic,
          content: JSON.stringify(entry),
          created: now,
        }],
      ];

      if (topic.startsWith(SUBSCRIPION_TOPIC_PREFIX)) {
        // increment the last-id (so subscription polling can pick up), and update the subscription ID
        subscriptionLastId++;
        atomicDataUpdate.push([
          ["subscription-last-id", topic],
          subscriptionLastId,
        ]);
      }

      await this.backend.setValues(atomicDataUpdate as any);
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

  // +++ SUBSCRIPTION +++ //
  async getSubscription(id: string): Promise<Subscription | null> {
    const subscription = await this.backend.getValue<Subscription>([
      "subscriptions",
    ], id);
    if (subscription === null) {
      return null;
    }

    return subscription;
  }

  async setSubscriptionProgress(
    topic: string,
    progress: SubscriptionSyncProgress,
  ) {
    await this.backend.setValues([
      [["subscriptions-progress", topic], progress],
    ]);
  }

  async getSubscriptionState(id: string) {
    const lastId = await this.backend.getValue<number>(
      ["subscription-last-id"],
      id,
    );

    return {
      lastId: lastId ?? undefined,
    };
  }

  // List all the subscriptions
  async *getSubscriptions() {
    for await (
      const entry of this.backend.listTable<string, Subscription>([
        "subscriptions",
      ])
    ) {
      yield entry.value;
    }
  }

  async setSubscriptionState(target: string, state: string, message: string) {
    await this.backend.setValue(["subscription-state"], target, {
      state,
      message,
    });
  }

  async addSubscription(
    source: string,
    target: string,
    serviceAccount: string,
    frequency: number,
  ): Promise<{ existed: boolean }> {
    const current = await this.backend.getValue(["subscriptions"], target);

    const subscription = {
      source,
      target,
      serviceAccount,
      frequency,
      created: Date.now(),
    };

    await this.backend.setValues<any>([
      [["subscriptions", target], subscription],
      [["subscription-last-id", target], -1],
    ]);

    return { existed: current !== null };
  }

  async close() {
    await this.backend.close();
  }

  async [Symbol.asyncDispose]() {
    await this.close();
  }
}
