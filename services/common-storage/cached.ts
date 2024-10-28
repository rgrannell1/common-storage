import { CommonStorage } from "./standard.ts";
import { Cache, cached } from "../../shared/cache.ts";
import { Permission } from "../../types/auth.ts";
import { IStorageBackend } from "../../types/storage.ts";

export class CachedCommonStorage extends CommonStorage {
  cache: Cache<any>;

  constructor(backend: IStorageBackend) {
    super(backend);
    this.cache = new Cache<any>();
  }

  async getRole(role: string) {
    return await cached({
      store: this.cache,
      id: (role: string) => `roles/${role}`,
    }, super.getRole.bind(this))(role);
  }

  async deleteRole(role: string) {
    return await cached({
      store: this.cache,
      clears: (role: string) => (key: string) => key === `roles/${role}`,
    }, super.deleteRole.bind(this))(role);
  }

  async addRole(role: string, permissions: Permission[]) {
    return await cached({
      store: this.cache,
      clears: (role: string) => (key: string) => key === `roles/${role}`,
    }, super.addRole.bind(this))(role, permissions);
  }

  async getUser(user: string) {
    return await cached({
      store: this.cache,
      id: (user: string) => `users/${user}`,
    }, super.getUser.bind(this))(user);
  }

  async getUsers() {
    return await cached({
      store: this.cache,
      id: () => `users`,
    }, super.getUsers.bind(this))();
  }

  async deleteUser(user: string) {
    return await cached({
      store: this.cache,
      clears: (user: string) => (key: string) =>
        key === `users/${user}` || key === "users",
    }, super.deleteUser.bind(this))(user);
  }

  async addUser(user: string, role: string, password: string) {
    return await cached({
      store: this.cache,
      clears: (user: string) => (key: string) =>
        key === `users/${user}` || key === "users",
    }, super.addUser.bind(this))(user, role, password);
  }

  async getTopic(topic: string) {
    return await cached({
      store: this.cache,
      id: (topic: string) => `topics/${topic}`,
    }, super.getTopic.bind(this))(topic);
  }

  async addTopic(
    topic: string,
    user: string,
    description: string,
    schema: Record<string, unknown> | undefined,
  ) {
    return await cached({
      store: this.cache,
      clears: (topic: string) => (key: string) => key === `topics/${topic}`,
    }, super.addTopic.bind(this))(topic, user, description, schema);
  }

  async deleteTopic(topic: string) {
    return await cached({
      store: this.cache,
      clears: (topic: string) => (key: string) => key === `topics/${topic}`,
    }, super.deleteTopic.bind(this))(topic);
  }

  async getSubscription(id: string) {
    return await cached({
      store: this.cache,
      id: (id: string) => `subscriptions/${id}`,
    }, super.getSubscription.bind(this))(id);
  }

  async getSubscriptions() {
    return await cached({
      store: this.cache,
      id: () => `subscriptions`,
    }, super.getSubscriptions.bind(this))();
  }

  async addSubscription(
    source: string,
    target: string,
    serviceAccount: string,
    frequency: number,
  ) {
    return await cached({
      store: this.cache,
      clears: (target: string) => (key: string) =>
        key === `subscriptions/${target}` || key === "subscriptions",
    }, super.addSubscription.bind(this))(
      source,
      target,
      serviceAccount,
      frequency,
    );
  }
}
