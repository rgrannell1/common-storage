import type { SubscriptionStorage, User } from "../types/index.ts";

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
  PERMISSIONLESS_ROLE,
  SUBSCRIPTION_DELAY,
  SUBSCRIPTION_FAILED,
} from "../shared/constants.ts";

/**
 * Represents a class that handles subscriptions.
 */
export class Subscriptions {
  storage: SubscriptionStorage;
  intertalk: any;

  constructor(storage: SubscriptionStorage, intertalk: any) {
    this.storage = storage;
    this.intertalk = intertalk;
  }

  async fetchRemoteContent(
    user: User,
    topic: string,
    source: string,
    nextId: number,
  ) {
    // Establish a connection to the second common-storage server
    let response: Response;

    try {
      const client = new this.intertalk();
      response = await client.contentGet(
        source,
        nextId,
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
  async sync(
    source: string,
    topic: string,
    serviceAccount: string,
    frequency: number,
  ) {
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
    for await (const subscription of this.storage.getSubscriptions()) {
      if (subscription?.target === topic) {
        throw new MultipleSubscriptionError(
          `Another subscription already syncs to ${topic}`,
        );
      }
    }

    const nextId = await this.getNextId(topic);
    const content = await this.fetchRemoteContent(
      userData,
      topic,
      source,
      nextId,
    );

    // Save a subscription
    await this.storage.addSubscription(
      source,
      topic,
      serviceAccount,
      frequency,
    );
    await this.storage.addContent(undefined, topic, content);

    // we've performed an initial sync; now lets sync more of the content
    // up to some limit
    for (let breaker = 0; breaker < 100; breaker++) {
      await new Promise((res) => {
        setTimeout(res, SUBSCRIPTION_DELAY);
      });

      const nextId = await this.getNextId(topic);
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
    }
  }

  /*
   * Start checking subscriptions
   */
  startPoll() {
    return setInterval(async () => {
      // enumerate through subscriptions, to find one that's overdue execution.
      // We can do this more efficiently.

      for await (const subsciption of this.storage.getSubscriptions()) {
        const topicData = await this.storage.getTopicStats(subsciption.target);

        if (!topicData) {
          await this.storage.setSubscriptionState(
            subsciption.target,
            SUBSCRIPTION_FAILED,
            `Topic "${subsciption.target}" does not exist"`,
          );
          continue;
        }

        const isOverdue = Date.now() >
          (topicData.stats.lastUpdated + (subsciption.frequency * 1_000));
        if (!isOverdue) {
          continue;
        }

        // sync the subscription
        try {
          await this.sync(
            subsciption.source,
            subsciption.target,
            subsciption.serviceAccount,
            subsciption.frequency,
          );
        } catch (err) {
          // TODO set some complex state about subscription health, which we can check over REST
          console.log(err);
        }
      }
    }, 60_000);
  }
}
