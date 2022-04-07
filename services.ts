import { InMemoryStorage } from "./storage.ts";
import { Retry, Subscription } from "./types.ts";
import * as constants from "./constants.ts";
import * as log from "https://deno.land/std@0.134.0/log/mod.ts";

enum DownstreamState {
  Gone = "Gone",
  Retry = "Retry",
  Ok = "Ok",
}

class Downstream {
  subscription: Subscription;
  static MINIMUM_TIMEOUT = 1_000;
  static DEFAULT_TIMEOUT = 30_000;

  constructor(subscription: Subscription) {
    this.subscription = subscription;
  }

  getTimeout() {
    const params = new URLSearchParams(this.subscription.hookUrl);
    const timeout = params.get("timeout");

    if (!timeout) {
      return Downstream.DEFAULT_TIMEOUT;
    }

    try {
      return Math.min(
        Math.max(parseInt(timeout), Downstream.MINIMUM_TIMEOUT),
        Downstream.DEFAULT_TIMEOUT,
      );
    } catch {
      return Downstream.DEFAULT_TIMEOUT;
    }
  }

  async notify() {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), this.getTimeout());

    const { hookUrl } = this.subscription;
    try {
      log.info({
        message: "notifying URL",
        url: hookUrl,
      });

      var response = await fetch(hookUrl, {
        method: "POST",
        signal: controller.signal,
      } as any);

      clearTimeout(id);
    } catch (err) {
      if (!(err instanceof Error)) {
        throw err;
      }
      if (err.message === "Invalid URL") {
        log.warning({
          message: "url invalid, removing subscription",
          ...this.subscription,
        });
        return DownstreamState.Gone;
      } else if (err.name === "AbortError") {
        log.warning({
          message: "notify timed out",
          ...this.subscription,
        });
      } else {
        log.warning({
          message:
            `notify failed, retrying in ${constants.RETRY_SECONDS} seconds`,
          ...this.subscription,
        });
      }

      return DownstreamState.Retry;
    }

    if (response.status === 410) {
      log.warning({
        message: "notify responded with 410 status",
        ...this.subscription,
      });
      return DownstreamState.Gone;
    } else if (response.status >= 400) {
      log.warning({
        message: "notify responded with 400 status",
        ...this.subscription,
      });
      return DownstreamState.Retry;
    } else {
      log.info({
        message: "notify succeeded",
        ...this.subscription,
      });
      return DownstreamState.Ok;
    }
  }
}

const notifyDownstream = async (
  storage: InMemoryStorage,
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

export const retryNotification = async (
  storage: InMemoryStorage,
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

export const sendNotification = async (
  storage: InMemoryStorage,
  name: string,
) => {
  const subscriptions = await storage.getSubscriptions();
  await Promise.all(subscriptions.map((subscription: Subscription) => {
    if (subscription.topic === name) {
      return notifyDownstream(storage, subscription);
    }
  }));
};
