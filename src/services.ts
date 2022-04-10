import { Retry, Subscription } from "./types.ts";
import * as constants from "./constants.ts";
import { IStorage } from "./interfaces.ts";

/*
 * Each state we group notify responses into;
 *
 * - Gone:  delete the subscription
 * - Retry: we should attempt notification again
 * - Ok:    server successfully notified
 *
 */
export enum DownstreamState {
  Gone = "Gone",
  Retry = "Retry",
  Ok = "Ok",
}

/**
 * A class for interacting with the REST hook URL provided by a
 * subscription
 *
 * @class Downstream
 */
class Downstream {
  subscription: Subscription;

  constructor(subscription: Subscription) {
    this.subscription = subscription;
  }

  /**
   * Get the timeout from a subscription's URL, if specified.
   *
   * @return {number | undefined}
   * @memberof Downstream
   */
  getTimeout(): number | undefined {
    const params = new URLSearchParams(this.subscription.hookUrl);
    const timeout = params.get("timeout");

    if (!timeout) {
      return constants.DEFAULT_TIMEOUT_MS;
    }

    try {
      return Math.min(
        Math.max(parseInt(timeout), constants.MINIMUM_TIMEOUT_MS),
        constants.DEFAULT_TIMEOUT_MS,
      );
    } catch {
      return constants.DEFAULT_TIMEOUT_MS;
    }
  }

  /**
   * Notify the downstream subscription URL that new content
   * was published to a topic.
   *
   * @return {*}
   * @memberof Downstream
   */
  async notify() {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), this.getTimeout());

    const { hookUrl } = this.subscription;
    try {
      const params = {
        topic: this.subscription.topic,
        subscriptionId: this.subscription.id,
      };
      const url = `${hookUrl}?${new URLSearchParams(params)}`;

      console.log(JSON.stringify({
        message: "notifying URL",
        url,
      }));

      var response = await fetch(url, {
        method: "POST",
        signal: controller.signal,
      } as any);

      clearTimeout(id);
    } catch (err) {
      if (!(err instanceof Error)) {
        throw err;
      }

      // handle each type of error
      if (err.message === "Invalid URL") {
        console.log(JSON.stringify({
          message: "url invalid, removing subscription",
          ...this.subscription,
        }));
        return DownstreamState.Gone;
      } else if (err.name === "AbortError") {
        console.log(JSON.stringify({
          message: "notify timed out",
          ...this.subscription,
        }));
      } else {
        console.log(JSON.stringify({
          message: `notify failed, retrying in ${constants.RETRY_MS} seconds`,
          ...this.subscription,
        }));
      }

      return DownstreamState.Retry;
    }

    // handle each relevant status-code
    if (response.status === 410) {
      console.log(JSON.stringify({
        message: "notify responded with 410 status",
        ...this.subscription,
      }));
      return DownstreamState.Gone;
    } else if (response.status >= 400) {
      console.log(JSON.stringify({
        message: "notify responded with 400 status",
        ...this.subscription,
      }));
      return DownstreamState.Retry;
    } else {
      console.log(JSON.stringify({
        message: "notify succeeded",
        ...this.subscription,
      }));
      return DownstreamState.Ok;
    }
  }
}

/**
 * Notify a downstream service & register results
 *
 * @param {IStorage} storage
 * @param {Subscription} subscription
 * @return {*}
 */
const notifyDownstream = async (
  storage: IStorage,
  subscription: Subscription,
) => {
  try {
    const downstream = new Downstream(subscription);
    var state = await downstream.notify();
  } catch (err) {
    console.error(err);
    return;
  }
  const id = subscription.id;
  await storage.updateSubscriptionState(id, state);

  if (state === DownstreamState.Gone) {
    await storage.deleteSubscription(id);
  } else if (state === DownstreamState.Ok) {
    await storage.deleteRetry(id);
  } else if (state === DownstreamState.Retry) {
    await storage.addRetry(id);
  } else {
    throw new Error(`notifyDownstream: unknown state "${state}"`);
  }
};

/**
 * Retry any downstream URLs
 *
 * @param {IStorage} storage
 * @param {Subscription} subscription
 * @return {*}
 */
export const retryNotification = async (
  storage: IStorage,
) => {
  const retries = await storage.getRetries();

  await Promise.all(
    Object.values(retries).map((retry: Retry) => {
      const now = Date.now();

      if (now > retry.after) {
        return notifyDownstream(storage, retry.subscription);
      }
    }),
  );
};

/**
 * Send notififications for each subscription
 *
 * @param {IStorage} storage
 * @param {Subscription} subscription
 * @return {*}
 */
export const notifySubscriptions = async (
  storage: IStorage,
  name: string,
) => {
  const subscriptions = await storage.getSubscriptions();
  await Promise.all(subscriptions.map((subscription: Subscription) => {
    if (subscription.topic === name) {
      return notifyDownstream(storage, subscription);
    }
  }));
};
