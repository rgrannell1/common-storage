import type {
  AIntertalk,
  Subscription,
  SubscriptionStorage,
  User,
} from "../types/index.ts";

import {
  ContentInvalidError,
  JSONError,
  MultipleSubscriptionError,
  NetworkError,
  SubscriptionAuthorisationError,
  TopicNotFoundError,
  UserHasPermissionsError,
  UserNotFound,
} from "../shared/errors.ts";
import {
  MAX_SUBSCRIPTION_LOCK_DURATION,
  PERMISSIONLESS_ROLE,
  SUBSCRIPTION_DELAY,
  SUBSCRIPTION_FAILED,
} from "../shared/constants.ts";

import { ILogger } from "../types/index.ts";
import { SubscriptionSyncState } from "../types/storage.ts";
import { SubscriptionSyncProgress } from "../types/storage.ts";

/**
 * Represents a class that handles subscriptions.
 */
export class Subscriptions {
  storage: SubscriptionStorage;
  logger: ILogger;
  intertalk: any;

  constructor(storage: SubscriptionStorage, logger: ILogger, intertalk: any) {
    this.storage = storage;
    this.logger = logger;
    this.intertalk = intertalk;
  }

  async fetchRemoteContent(
    user: User,
    topic: string,
    source: string,
    startId: number,
  ) {
    // Establish a connection to the second common-storage server
    let response: Response;

    try {
      const client = new this.intertalk();
      response = await client.contentGet(
        source,
        startId,
        user.name,
        user.password,
      );
    } catch (err) {
      if (err.message.includes("tcp connect error")) {
        throw new NetworkError(
          `Failed to establish a TCP connection to${source}`,
        );
      }

      throw new NetworkError(`Failed to connect to the source server: ${err}`);
    }

    if (response.status === 401) {
      console.log(await response.json());
      throw new SubscriptionAuthorisationError(
        `The service-account "${user.name}" is not authorised to access remote topic "${source}"`,
      );
    }

    // check the response is even JSON
    let resBody: unknown;
    try {
      resBody = await response.json();
    } catch (err) {
      throw new JSONError(
        `Could not parse response from requested server as JSON`,
      );
    }

    // Validate "content" property exists
    if (!Object.prototype.hasOwnProperty.call(resBody, "content")) {
      throw new ContentInvalidError(
        `The requested server returned a response to ${source} without a "content" property`,
      );
    }

    // Validate "content" property is an array
    if (!Array.isArray((resBody as { content: unknown }).content)) {
      throw new ContentInvalidError(
        `The requested server returned a response to ${source} with a non-array "content" property`,
      );
    }

    // Add the content to the server
    const content = (resBody as { content: unknown[] }).content;

    // Validate the content before attempting to save the subscription
    await this.storage.validateContent(topic, content);

    return content;
  }

  async getNextId(topic: string) {
    // We need to find a start-id to enumerate from
    const subscriptionState = await this.storage.getSubscriptionState(topic);
    return subscriptionState?.lastId ? subscriptionState.lastId + 1 : 0;
  }

  /*
   * Sync content from a source URL to a target topic. Store a subscription
   * if not already stored.
   */
  async *sync(
    source: string,
    topic: string,
    serviceAccount: string,
    frequency: number,
    create: boolean = true,
  ): AsyncGenerator<SubscriptionSyncProgress> {
    await this.logger.info("syncing subscription", undefined, {
      source,
      topic,
      frequency,
    });

    const topicData = await this.storage.getTopic(topic);

    // check the target topic actually exists. JSON schema
    // will already check it starts with "subscription."
    if (!topicData) {
      throw new TopicNotFoundError(`Topic "${topic}" does not exist`);
    }

    // check the service-account actually exists
    const userData = await this.storage.getUser(serviceAccount);
    if (!userData) {
      throw new UserNotFound(`User "${serviceAccount}" does not exist`);
    }

    // ... and check the account doesn't have any permissions
    if (userData.role !== PERMISSIONLESS_ROLE) {
      throw new UserHasPermissionsError(
        `User "${serviceAccount}" does not have the ${PERMISSIONLESS_ROLE} role, so cannot be used as a service-account for retrieving subscriptions from another server`,
      );
    }

    // check no existing subscription
    if (create) {
      for await (const subscription of this.storage.getSubscriptions()) {
        if (subscription?.target === topic) {
          throw new MultipleSubscriptionError(
            `Another subscription already syncs to ${topic}`,
          );
        }
      }
    }

    let nextId = await this.getNextId(topic);

    await this.logger.info("fetching remote content", undefined, {
      nextId,
      topic,
      source,
    });

    const content = await this.fetchRemoteContent(
      userData,
      topic,
      source,
      nextId,
    );

    yield {
      state: SubscriptionSyncState.FIRST_CONTENT_FETCH_OK,
      startId: nextId,
    };

    // Save a subscription
    if (create) {
      await this.storage.addSubscription(
        source,
        topic,
        serviceAccount,
        frequency,
      );

      await this.logger.info("saving subscription", undefined, {
        source,
        nextId,
        topic,
      });

      yield {
        state: SubscriptionSyncState.SUBSCRIPTION_SAVED,
        startId: nextId,
      };
    }

    await this.storage.setLock(topic);
    try {
      await this.storage.addContent(undefined, topic, content);

      await this.logger.info("saved first content batch", undefined, {
        topic,
      });

      yield {
        state: SubscriptionSyncState.FIRST_CONTENT_SAVED,
        startId: nextId,
      };

      // we've performed an initial sync; now lets sync more of the content
      // up to some limit
      while (true) {
        await new Promise((res) => {
          setTimeout(res, SUBSCRIPTION_DELAY);
        });

        nextId = await this.getNextId(topic);

        await this.logger.info("fetching subscription content", undefined, {
          nextId,
        });

        await this.storage.setLock(topic);
        const content = await this.fetchRemoteContent(
          userData,
          topic,
          source,
          nextId,
        );

        if (content.length === 0) {
          break;
        }

        await this.storage.addContent(undefined, topic, content);

        yield {
          state: SubscriptionSyncState.CONTENT_SAVED,
          startId: nextId,
        };
      }

      await this.logger.info("subscription sync completed", undefined, {
        nextId,
        topic,
      });
    } finally {
      await this.storage.deleteLock(topic);
    }

    yield {
      state: SubscriptionSyncState.SYNC_COMPLETED,
      startId: nextId,
    };
  }

  /*
   * Check if a subscription is locked
   */
  async isLockActive(topic: string) {
    const lockedAt = await this.storage.getLock(topic);
    return lockedAt && (Date.now() - lockedAt) < MAX_SUBSCRIPTION_LOCK_DURATION;
  }

  /*
   * Check if a subscription is overdue
   */
  async isSubscriptionOverdue(topicData: any, subscription: any) {
    return Date.now() >
      (topicData.stats.lastUpdated + (subscription.frequency * 1_000));
  }

  /*
   * Start checking subscriptions
   */
  startPoll() {
    return setInterval(async () => {
      // enumerate through subscriptions, to find one that's overdue execution.
      // We can do this more efficiently.

      this.logger.info("polling subscriptions", undefined, {});

      for await (const subsciption of this.storage.getSubscriptions()) {
        const topicData = await this.storage.getTopicStats(subsciption.target);

        if (!topicData) {
          this.logger.info("subscription missing", undefined, {
            target: subsciption.target,
          });

          await this.storage.setSubscriptionState(
            subsciption.target,
            SUBSCRIPTION_FAILED,
            `Topic "${subsciption.target}" does not exist"`,
          );
          continue;
        }

        if (await this.isLockActive(subsciption.target)) {
          this.logger.info(
            "subscription is locked (and probably already syncing)",
            undefined,
            {
              source: subsciption.source,
              topic: subsciption.target,
              frequency: subsciption.frequency,
            },
          );
          continue;
        }

        // check we actually need to poll for the subscription again
        const isOverdue = await this.isSubscriptionOverdue(
          topicData,
          subsciption,
        );
        if (!isOverdue) {
          this.logger.info("subscription is not overdue", undefined, {
            frequencey: subsciption.frequency,
          });
          continue;
        }

        this.logger.info("subscription is overdue", undefined, {
          frequencey: subsciption.frequency,
        });

        // sync the subscription
        try {
          const { source, target, serviceAccount, frequency } = subsciption;
          const subscriptionSync = this.sync(
            source,
            target,
            serviceAccount,
            frequency,
            false,
          );

          for await (const progress of subscriptionSync) {
            await this.storage.setSubscriptionProgress(target, progress);
          }
        } catch (err) {
          await this.logger.error("subscription failed", undefined, {
            message: err.message,
            stack: err.stack,
            source: subsciption.source,
            topic: subsciption.target,
            frequency: subsciption.frequency,
          });
          await this.storage.setSubscriptionState(
            subsciption.target,
            SUBSCRIPTION_FAILED,
            err.message,
          );
        }
      }
    }, 60_000);
  }
}
