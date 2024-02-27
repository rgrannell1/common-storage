export type PostUserOpts = {
  role: string;
  password: string;
};

export type PostRoleOpts = {};

export type PostSubscriptionOpts = {};

export type PostContentOpts = {};

export type PostTopicOpts = {};

export class CommonStorageClient {
  endpoint: string;
  credentials?: {
    username: string;
    password: string;
  };

  constructor(
    endpoint: string,
    credentials: { username: string; password: string } | undefined = undefined,
  ) {
    this.endpoint = endpoint;
    this.credentials = credentials;
  }

  static new(
    endpoint: string,
    credentials: { username: string; password: string } | undefined = undefined,
  ) {
    return new CommonStorageClient(endpoint, credentials);
  }

  withCredentials(username: string, password: string) {
    return new CommonStorageClient(this.endpoint, { username, password });
  }

  #performApiCall(method: string, route: string, body?: string) {
    return fetch(`${this.endpoint}${route}`, {
      method: method,
      headers: {
        "Authorization": this.credentials
          ? `Basic ${
            btoa(`${this.credentials.username}:${this.credentials.password}`)
          }`
          : "",
        "Content-Type": "application/json",
      },
      body,
    });
  }

  getUser(name: string) {
    return this.#performApiCall("GET", `/user/${name}`);
  }
  postUser(name: string, opts: PostUserOpts) {
    return this.#performApiCall("POST", `/user/${name}`, JSON.stringify(opts));
  }
  getRole(role: string) {
    return this.#performApiCall("GET", `/role/${role}`);
  }
  postRole(role: string, opts: PostRoleOpts) {
    return this.#performApiCall("POST", `/role/${role}`, JSON.stringify(opts));
  }
  getFeed() {
    return this.#performApiCall("GET", "/feed");
  }
  getSubscription(target: string) {
    return this.#performApiCall("GET", `/subscription/${target}`);
  }
  postSubscription(target: string, opts: PostSubscriptionOpts) {
    return this.#performApiCall(
      "POST",
      `/subscription/${target}`,
      JSON.stringify(opts),
    );
  }
  getContent(topic: string) {
    return this.#performApiCall("GET", `/content/${topic}`);
  }
  postContent(topic: string, opts: PostContentOpts) {
    return this.#performApiCall(
      "POST",
      `/content/${topic}`,
      JSON.stringify(opts),
    );
  }
  getTopic(topic: string) {
    return this.#performApiCall("GET", `/topic/${topic}`);
  }
  postTopic(topic: string, opts: PostTopicOpts) {
    return this.#performApiCall(
      "POST",
      `/topic/${topic}`,
      JSON.stringify(opts),
    );
  }
  deleteTopic(topic: string) {
    return this.#performApiCall("DELETE", `/topic/${topic}`);
  }
}
