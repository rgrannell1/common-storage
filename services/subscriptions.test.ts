import { assertRejects } from "../dev_deps.ts";
import { Subscriptions } from "./subscriptions.ts";
import {
  ContentInvalidError,
  MultipleSubscriptionError,
  TopicNotFoundError,
  UserHasPermissionsError,
  UserNotFound,
} from "../shared/errors.ts";
import { IIntertalk, SubscriptionSyncProgress } from "../types/storage.ts";

const blankStorage = {
  async getTopic(_: string) {
    return null;
  },
  async getUser(_: string) {
    return null;
  },
  async getRole(_: string) {
    return null;
  },
  async getTopicStats(_: string) {
    return null;
  },
  async getSubscriptions() {
    return [];
  },
  async getSubscriptionState(_: string) {
    return null;
  },
  async setSubscriptionProgress(_: string, __: SubscriptionSyncProgress) {
  },
  async addContent<T>(_: string | undefined, __: string, ___: T[]) {
    return { lastId: 0 };
  },
  async getLock(_: string) {
    return null;
  },
  async setLock(_: string) {
  },
  async deleteLock(_: string) {
  },
  async getSubscriptionProgress(_: string) {
    return null;
  },
  async addSubscription(_: string, __: string, ___: string, ____: number) {
    return { existed: false };
  },
  async validateContent<T>(_: string, __: T[]) {},
  async setSubscriptionState() {},
};

const stubLogger = {
  async info() {},
  async error() {},
};

function StubIntertalkClient<T>(content: T) {
  return class implements IIntertalk {
    contentGet(
      _: string,
      __: number,
      ___: string,
      ____: string,
    ) {
      return Promise.resolve(new Response(JSON.stringify(content)));
    }
  };
}

async function getTopic(topic: string) {
  return {
    name: topic,
    description: "Present",
    created: Date.now().toLocaleString(),
  };
}

async function getUser(username: string) {
  return {
    name: username,
    role: "admin",
    password: "password",
    created: Date.now().toLocaleString(),
  };
}

async function getUserValid(username: string) {
  return {
    name: username,
    role: "PERMISSIONLESS",
    password: "password",
    created: Date.now().toLocaleString(),
  };
}

async function getSubscriptionState(id: string) {
  return {
    lastId: 0,
  };
}

Deno.test("Subscriptions.sync() | fails when topic is not present", async () => {
  const sub = new Subscriptions(
    { ...blankStorage },
    stubLogger,
    StubIntertalkClient(""),
  );

  await assertRejects(
    async () => {
      for await (
        const _ of sub.sync(
          "http://example.com/",
          "subscription.example",
          "service-account",
          60,
        )
      );
    },
    TopicNotFoundError,
    'Topic "subscription.example" does not exist',
  );
});

Deno.test("Subscriptions.sync() | fails when user is not present", async () => {
  const store = {
    ...blankStorage,
    getTopic,
  };

  const sub = new Subscriptions(store, stubLogger, StubIntertalkClient(""));

  await assertRejects(
    async () => {
      for await (
        const _ of sub.sync(
          "http://example.com/",
          "subscription.example",
          "service-account",
          60,
        )
      );
    },
    UserNotFound,
    'User "service-account" does not exist',
  );
});

Deno.test("Subscriptions.sync() | fails when user has permissions", async () => {
  const store = {
    ...blankStorage,
    getTopic,
    getUser,
  };
  const sub = new Subscriptions(store, stubLogger, StubIntertalkClient(""));

  await assertRejects(
    async () => {
      for await (
        const _ of sub.sync(
          "http://example.com/",
          "subscription.example",
          "service-account",
          60,
        )
      );
    },
    UserHasPermissionsError,
    'User "service-account" does not have the PERMISSIONLESS role, so cannot be used as a service-account for retrieving subscriptions from another server',
  );
});

Deno.test("Subscriptions.sync() | fails when subscription already present", async () => {
  const store = {
    ...blankStorage,
    getTopic,
    getUser: getUserValid,
    async getSubscriptions() {
      return [{
        source: "example.com",
        target: "subscription.example",
        serviceAccount: "service-account",
        frequency: 60,
        created: 1234,
      }];
    },
  };
  const sub = new Subscriptions(store, stubLogger, StubIntertalkClient(""));

  await assertRejects(
    async () => {
      for await (
        const _ of sub.sync(
          "http://example.com/",
          "subscription.example",
          "service-account",
          60,
        )
      );
    },
    MultipleSubscriptionError,
    "Another subscription already syncs to subscription.example",
  );
});

Deno.test("Subscriptions.sync() | handled authentication failures to other server", async () => {
});

Deno.test("Subscriptions.sync() | handles invalid content responses", async () => {
  const store = {
    ...blankStorage,
    getTopic,
    getUser: getUserValid,
    getSubscriptionState,
  };
  const sub = new Subscriptions(store, stubLogger, StubIntertalkClient("{  }"));

  await assertRejects(
    async () => {
      for await (
        const _ of sub.sync(
          "http://example.com/",
          "subscription.example",
          "service-account",
          60,
        )
      );
    },
    ContentInvalidError,
    'without a "content" property',
  );
});

Deno.test("Subscriptions.sync() | constructs the required data", async () => {
});
