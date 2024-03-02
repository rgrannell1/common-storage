import { assert } from "https://deno.land/std@0.211.0/assert/assert.ts";
import { csApp, csServices, startApp } from "../app.ts";
import { CommonStorageClient } from "../library/comon-storage.ts";
import { assertEquals } from "https://deno.land/std@0.202.0/assert/assert_equals.ts";

abstract class TestServer {
  _config: any;
  services: any;
  app: any;
  appController: any;

  abstract config(): any;

  constructor() {
    this._config = this.config();
  }
  async start() {
    this.services = await csServices(this._config);
    this.app = await csApp(this._config, this.services);
    this.appController = await startApp(this.app, this._config);
  }

  client() {
    return CommonStorageClient.new(`http://localhost:${this._config.port}`);
  }

  async stop() {
    this.appController.abort();
  }
}

class RemoteNoteServer extends TestServer {
  config() {
    return {
      port: 9000,
      title: "remote-server",
      description: "we will publish notes here over an API",
      logger: "console",
      adminUsername: "admin",
      adminPassword: "admin",
      kvPath: "/tmp/remote-server",
    };
  }

  async createNotesReadWriteAccount() {
    const roleCreate = await this.client()
      .withCredentials(this._config.adminUsername, this._config.adminPassword)
      .postRole("notes_read_write", {
        permissions: [{
          routes: ["POST /topic", "POST /content", "GET /content"],
          topics: ["notes"],
        }],
      });

    assertEquals(roleCreate.status, 200);

    const userCreate = await this.client()
      .withCredentials(this._config.adminUsername, this._config.adminPassword)
      .postUser("notes_read_write", {
        role: "notes_read_write",
        password: "pwd_notes_read_write",
      });

    assertEquals(userCreate.status, 200);
  }

  async createNotesReadAccount() {
    const roleCreate = await this.client()
      .withCredentials(this._config.adminUsername, this._config.adminPassword)
      .postRole("notes_read", {
        permissions: [{
          routes: ["GET /content"],
          topics: ["notes"],
        }],
      });

    assertEquals(roleCreate.status, 200);

    const userCreate = await this.client()
      .withCredentials(this._config.adminUsername, this._config.adminPassword)
      .postUser("notes_read", {
        role: "notes_read",
        password: "pwd_notes_read",
      });

    assertEquals(userCreate.status, 200);
  }

  async createNotesTopic() {
    const topicCreate = await this.client()
      .withCredentials("notes_read_write", "pwd_notes_read_write")
      .postTopic("notes", {
        description: "These sure are some JSON-formatted notes!",
        schema: {
          "$schema": "http://json-schema.org/draft-07/schema#",
          type: "object",
          properties: {
            title: { type: "string" },
            content: { type: "string" },
          },
          required: ["title", "content"],
        },
      });

    assertEquals(topicCreate.status, 200);
  }

  async addNotes() {
    const postBadContent = await this.client()
      .withCredentials("notes_read_write", "pwd_notes_read_write")
      .postContent("notes", {
        content: [{
          title: "This is only a title",
        }],
      });

    assertEquals(postBadContent.status, 422);

    const content: { title: string; content: string }[] = [];

    for (let idx = 0; idx < 20; idx++) {
      content.push({
        title: `${idx}`,
        content: "All work and no play makes Jack a dull boy",
      });
    }

    const postValidContent = await this.client()
      .withCredentials("notes_read_write", "pwd_notes_read_write")
      .postContent("notes", { content });

    assertEquals(postValidContent.status, 200);
  }
}

class LocalNoteServer extends TestServer {
  config() {
    return {
      port: 8000,
      title: "local-server",
      description: "we will sync notes here from the remote",
      logger: "console",
      adminUsername: "admin",
      adminPassword: "admin",
      kvPath: "/tmp/local-server",
    };
  }

  async createReadAcount() {
    const roleCreate = await this.client()
      .withCredentials(this._config.adminUsername, this._config.adminPassword)
      .postRole("local_read", {
        permissions: [{
          routes: ["GET /content"],
          topics: ["subscription.notes"],
        }],
      });

    assertEquals(roleCreate.status, 200);

    const userCreate = await this.client()
      .withCredentials(this._config.adminUsername, this._config.adminPassword)
      .postUser("local_notes_read", {
        role: "local_read",
        password: "pwd_local_notes_read",
      });

    assertEquals(userCreate.status, 200);
  }

  async createServiceAccount() {
    const userCreate = await this.client()
      .withCredentials(this._config.adminUsername, this._config.adminPassword)
      .postUser("notes_read", {
        role: "PERMISSIONLESS",
        password: "pwd_notes_read",
      });

    assertEquals(userCreate.status, 200);
  }

  async createSubscriptionTopic() {
    const topicCreate = await this.client()
      .withCredentials(this._config.adminUsername, this._config.adminPassword)
      .postTopic("subscription.notes", {
        description: "These are notes from a remote server",
        schema: {
          "$schema": "http://json-schema.org/draft-07/schema#",
          type: "object",
          properties: {
            title: { type: "string" },
            content: { type: "string" },
          },
          required: ["title", "content"],
        },
      });

    assertEquals(topicCreate.status, 200);
  }

  async subscribeToRemoteNotes(remotePort: number) {
    const subscriptionCreate = await this.client()
      .withCredentials(this._config.adminUsername, this._config.adminPassword)
      .postSubscription("subscription.notes", {
        source: `http://localhost:${remotePort}/content/notes`,
        serviceAccount: "notes_read",
        frequency: 60,
      });

    assertEquals(subscriptionCreate.status, 200);
  }

  async getContent() {
    const firstGet = await this.client()
      .withCredentials("local_notes_read", "pwd_local_notes_read")
      .getContent("subscription.notes", 0);
    const firstBody = await firstGet.json();

    assertEquals(firstBody.startId, 0);
    assertEquals(firstBody.lastId, 9);
    assertEquals(firstBody.nextId, 10);
    assertEquals(firstBody.content.length, 10);

    assertEquals(firstGet.status, 200);

    const secondGet = await this.client()
      .withCredentials("local_notes_read", "pwd_local_notes_read")
      .getContent("subscription.notes", 10);

    const secondBody = await secondGet.json();

    assertEquals(secondBody.startId, 10);
    assertEquals(secondBody.lastId, 19);
    assertEquals(secondBody.nextId, 20);
    assertEquals(secondBody.content.length, 10);

    assertEquals(secondGet.status, 200);

    const lastGet = await this.client()
      .withCredentials("local_notes_read", "pwd_local_notes_read")
      .getContent("subscription.notes", 20);

    const lastBody = await lastGet.json();

    assertEquals(lastBody.startId, 20);
    assertEquals(lastBody.nextId, 20);
    assertEquals(lastBody.content.length, 0);

    assertEquals(lastGet.status, 200);
  }

  async getFeed() {
    const feedRes = await this.client().getFeed();
    const body = await feedRes.json();

    assertEquals(
      body.subscriptions["subscription.notes"],
      "http://localhost:9000/content/notes",
    );
  }
}

const localServer = new LocalNoteServer();
const remoteServer = new RemoteNoteServer();

await localServer.start();
await remoteServer.start();

await remoteServer.createNotesReadAccount();
await remoteServer.createNotesReadWriteAccount();
await remoteServer.createNotesTopic();
await remoteServer.addNotes();

await localServer.createReadAcount();
await localServer.createServiceAccount();
await localServer.createSubscriptionTopic();
await localServer.subscribeToRemoteNotes(remoteServer.config().port);

await new Promise((res) => setTimeout(res, 4_000));

await localServer.getContent();
await localServer.getFeed();

await localServer.stop();
await remoteServer.stop();
