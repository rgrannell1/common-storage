import type {
AIntertalk,
  SubscriptionStorage,
} from "../types/index.ts";
import {
  ContentInvalidError,
  JSONError,
  MultipleSubscriptionError,
  NetworkError,
  TopicNotFoundError,
  UserHasPermissionsError,
  UserNotFound,
} from "../shared/errors.ts";
import { PERMISSIONLESS_ROLE } from "../shared/constants.ts";
import { IntertalkClient } from "./intertalk.ts";

/**
 * Represents a class that handles subscriptions.
 */
export class Subscriptions {
  storage: SubscriptionStorage;
  intertalk: any

  constructor(storage: SubscriptionStorage, intertalk: any) {
    this.storage = storage;
    this.intertalk = intertalk;
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

    // We need to find a start-id to enumerate from
    const subscriptionState = await this.storage.getSubscriptionState(topic);
    const nextId = subscriptionState?.lastId ? subscriptionState.lastId + 1 : 0;

    // Establish a connection to the second common-storage server
    let response: Response;
    try {
      const client = new this.intertalk(IntertalkClient.baseurl(source));
      response = await client.contentGet(
        topic,
        nextId,
        serviceAccount,
        userData.password,
      );
    } catch (err) {
      // TODO can fail for many many reasons
      throw new NetworkError(`Failed to connect to the source server: ${err}`);
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
        `The requested server returned a response to /content/<your-topic> without a "content" property`,
      );
    }

    // Validate "content" property is an array
    if (!Array.isArray((resBody as { content: unknown }).content)) {
      throw new ContentInvalidError(
        `The requested server returned a response to /content/<your-topic> with a non-array "content" property`,
      );
    }

    // Add the content to the server
    const content = (resBody as { content: unknown[] }).content;

    // Validate the content before attempting to save the subscription
    await this.storage.validateContent(topic, content);

    // Save a subscription
    await this.storage.addSubscription(
      source,
      topic,
      serviceAccount,
      frequency,
    );

    // Attempt to add the content
    await this.storage.addContent(undefined, topic, content);
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
          // TODO log an error, this should not happpen
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
