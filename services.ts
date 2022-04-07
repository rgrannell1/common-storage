import { InMemoryStorage } from "./storage.ts";
import { Subscription } from "./types.ts";

class Downstream {
  subscription: Subscription;

  constructor(subscription: Subscription) {
    this.subscription = subscription;
  }

  async notify() {
    const response = await fetch({
      url: this.subscription.hookUrl,
    } as any);
  }
}

export const sendNotification = async (
  storage: InMemoryStorage,
  name: string,
) => {
  const subscriptions = await storage.getSubscriptions();

  for (const subscription of subscriptions) {
    if (subscription.topic !== name) {
      continue;
    }

    try {
      const downstream = new Downstream(subscription);
      await downstream.notify();
    } catch (err) {
    }
  }
};
