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

    const postValidContent = await this.client()
      .withCredentials("notes_read_write", "pwd_notes_read_write")
      .postContent("notes", {
        content: Array(20).fill({
          title: "All work and no play",
          content: "Makes Jack a dull boy",
        }),
      });

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
    console.log(await subscriptionCreate.json());
    assertEquals(subscriptionCreate.status, 200);
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

await localServer.createServiceAccount();
await localServer.createSubscriptionTopic();
await localServer.subscribeToRemoteNotes(remoteServer.config().port);

await localServer.stop();
await remoteServer.stop();
