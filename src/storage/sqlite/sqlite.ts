import type {
  AddSubscriptionResponse,
  DeleteSubscriptionResponse,
  DeleteTopicResponse,
  GetSubscriptionIdsResponse,
  GetSubscriptionResponse,
  GetSubscriptionStatsResponse,
  IStorage,
} from "../.././types/interfaces/storage.ts";
import type { Topic } from "../../types/types.ts";
import type {
  AddContentResponse,
  AddTopicResponse,
  GetTopicStatsResponse,
} from "../.././types/interfaces/storage.ts";

import { DB } from "https://deno.land/x/sqlite/mod.ts";

const tables = [
  `create table if not exists batches (
    batchId        text primary key,
    closed         text not null,
    created        text not null
  );
  `,
  `create table if not exists content (
    contentId      integer primary key autoincrement,
    batchId        text not null,
    topic          text not null,
    value          blob not null,
    created        text not null
  );
  `,
  `create table if not exists topics (
    topic          text primary key,
    description    text not null,
    created        text not null
  );
  `,
  `create table if not exists subscriptions (
    id                   text primary key,
    topic                text not null,
    target               text not null,
    lastMaxId            integer not null,
    frequency            integer not null,
    updateCount          integer not null,
    contactedCount       integer not null,
    lastContactedDate    text,
    lastStatus           text not null,
    lastUpdateDate       text
  )`,
];

export class Sqlite implements IStorage {
  db: DB;
  #loaded: boolean;

  constructor(opts: { fpath: string }) {
    this.db = new DB(opts.fpath);
    this.#loaded = false;
  }

  async init() {
    for (const table of tables) {
      this.db.query(table);
    }

    this.#loaded = true;
  }

  assertLoaded() {
    if (!this.#loaded) {
      throw new Error("not loaded");
    }
  }

  async getTopicNames(): Promise<string[]> {
    this.assertLoaded();

    const rows = this.db.query("select topic from topics");

    return rows.map((row) => row[0] as string);
  }

  async getTopic(topic: string): Promise<Topic> {
    this.assertLoaded();

    const topicRow = this.db.query(
      "select description, created from topics where topic = ?",
      [topic],
    );
    if (topicRow.length === 0) {
      throw new Error(`topic "${topic}" not present`);
    }

    const description = topicRow[0][0] as string;
    const created = parseInt(topicRow[0][1] as string);
    const iso = (new Date(created)).toISOString();

    return {
      name: topic,
      description,
      created: iso,
    };
  }

  async getTopicStats(topic: string): Promise<GetTopicStatsResponse> {
    this.assertLoaded();

    const [[count]] = this.db.query(
      `
    select count(*) from content
    where batchId not in (
      select batchId from batches where closed != 'true'
    ) and topic = ?
    `,
      [topic],
    );

    return {
      topic: await this.getTopic(topic),
      stats: {
        count: count as number,
      },
    };
  }

  async addTopic(
    topic: string,
    description: string,
  ): Promise<AddTopicResponse> {
    this.assertLoaded();

    const previousRow = await this.db.query(
      "select count(*) from topics where topic = ?",
      [topic],
    );

    await this.db.query(
      "insert or replace into topics(topic, description, created) values (?, ?, ?)",
      [
        topic,
        description,
        Date.now(),
      ],
    );

    return {
      existed: previousRow[0][0] !== 0,
    };
  }

  async deleteTopic(topic: string): Promise<DeleteTopicResponse> {
    const previousRow = await this.db.query(
      "select count(*) from topics where topic = ?",
      [topic],
    );

    await this.db.query("delete from topics where topic = ?", [topic]);
    await this.db.query("delete from content where topic = ?", [topic]);

    return {
      existed: previousRow[0][0] !== 0,
    };
  }

  async #closeBatch(batchId: string) {
    await this.assertLoaded();

    const existing = this.db.query(
      "select created from batches where batchId = ?",
      [batchId],
    );

    this.db.query(
      "insert or replace into batches(batchId, closed, created) values (?, ?, ?)",
      [batchId, "true", existing[0][0] as string],
    );
  }

  async getBatch(batchId: string) {
    const rows = this.db.query("select closed from batches where batchId = ?", [
      batchId,
    ]);

    if (rows.length === 0) {
      return {
        batchId,
        status: "missing",
      };
    }

    const closed = rows[0][0];

    return {
      batchId,
      status: closed === "true" ? "closed" : "open",
    };
  }

  async addBatch(batchId: string) {
    await this.assertLoaded();

    const now = Date.now();
    this.db.query(
      "insert or replace into batches(batchId, closed, created) values (?, ?, ?)",
      [batchId, "false", now],
    );
  }

  async getContent(topic: string, startId: string | undefined) {
    await this.assertLoaded();

    var rows: any;

    if (!startId) {
      rows = this.db.query(
        `
      select contentId, value, created
      from content
      where batchId not in (
        select batchId from batches where closed != 'true'
      ) and topic = ?
      order by contentId
      limit 10
      `,
        [topic],
      );
    } else {
      rows = this.db.query(
        `
      select contentId, value, created
      from content
      where batchId not in (
        select batchId from batches where closed != 'true'
      ) and contentId > ? and topic = ?
      order by contentId
      limit 10
      `,
        [startId, topic],
      );
    }

    let lastId = -1;
    for (const row of rows) {
      lastId = Math.max(lastId, row[0] as number);
    }

    const res: any = {
      topic,
      startId,
      content: rows.map((row: any) => {
        const date = parseInt(row[2]);
        const created = (new Date(date)).toISOString();

        return {
          id: row[0],
          value: JSON.parse(row[1]),
          created,
        };
      }),
    };
    if (lastId > 0) {
      res.lastId = lastId;
    }

    return res;
  }

  async addContent(
    batchId: string | undefined,
    topic: string,
    content: any[],
  ): Promise<AddContentResponse> {
    if (batchId) {
      const batch = await this.getBatch(batchId);

      if (batch.status === "missing") {
        this.addBatch(batchId);
      }

      if (batch.status === "closed" && content.length > 0) {
        throw new Error(`cannot add content to closed batch ${batchId}`);
      }

      if (content.length === 0) {
        this.#closeBatch(batchId);
      }
    }

    for (const entry of content) {
      this.db.query(
        `insert into content (batchId, topic, value, created)
        values (?, ?, ?, ?)`,
        [
          batchId ?? "",
          topic,
          JSON.stringify(entry),
          Date.now(),
        ],
      );
    }

    return {};
  }

  async getSubscription(id: string): Promise<GetSubscriptionResponse> {
    this.assertLoaded();

    const subscriptionRow = await this.db.query(
      "select topic, target, lastMaxId, frequency from subscriptions where id = ?",
      [id],
    );

    if (subscriptionRow.length === 0) {
      throw new Error('subscription "${id}" not present');
    }

    const [topic, target, lastMaxId, frequency] = subscriptionRow[0] as [
      string,
      string,
      number,
      number,
    ];

    return {
      topic,
      target,
      lastMaxId,
      frequency,
    };
  }

  async getSubscriptionIds(): Promise<GetSubscriptionIdsResponse> {
    const results = await this.db.query("select id from subscriptions");

    return {
      ids: results.map((result) => result[0] as string),
    };
  }

  async getSubscriptionStats(
    id: string,
  ): Promise<GetSubscriptionStatsResponse> {
    this.assertLoaded();

    const subscriptionRow = await this.db.query(
      `select updateCount, contactedCount, lastContactedDate, lastStatus, lastUpdateDate from subscriptions where id = ?`,
      [id],
    );

    if (subscriptionRow.length === 0) {
      throw new Error(`subscription "${id}" not present`);
    }

    const [
      updateCount,
      contactedCount,
      lastContactedDate,
      lastStatus,
      lastUpdateDate,
    ] = subscriptionRow[0] as [
      number,
      number,
      string,
      string,
      string,
    ];

    return {
      updateCount,
      contactedCount,
      lastContactedDate,
      lastStatus,
      lastUpdateDate,
    };
  }

  async addSubscription(
    topic: string,
    target: string,
    frequency: number,
  ): Promise<AddSubscriptionResponse> {
    this.assertLoaded();

    const previousRow = await this.db.query(
      "select count(*) from subscriptions where topic = ? and target = ?",
      [topic],
    );

    const existed = previousRow[0][0] !== 0;

    if (existed) {
      return {
        id: previousRow[0][1] as string,
        existed: true,
      };
    } else {
      const now = new Date();

      const id = `urn:subscription:${topic}_${target}_${now.toISOString()}`;

      const updateCount = 0;
      const contactedCount = 0;
      const lastContactedDate = "";
      const lastStatus = "NOT_CONTACTED";
      const lastUpdateDate = "";
      const lastMaxId = -1;

      await this.db.query(
        `
      insert or replace into subscriptions(
        id,
        topic,
        target,
        lastMaxId,
        frequency,
        updateCount,
        contactedCount,
        lastContactedDate,
        lastStatus,
        lastUpdateDate
      ) values ( ?, ?, ?, ?, ?, ?, ?, ?, ?, ? );
      `,
        [
          id,
          topic,
          target,
          lastMaxId,
          frequency,
          updateCount,
          contactedCount,
          lastContactedDate,
          lastStatus,
          lastUpdateDate,
        ],
      );

      return {
        id,
        existed,
      };
    }
  }

  async addSubscriptionSuccess(id: string, lastId: number): Promise<void> {
    this.assertLoaded();

    const subscriptionRow = await this.db.query(
      `select id from subscriptions where id = ?`,
      [id],
    );

    if (subscriptionRow.length === 0) {
      throw new Error(`subscription "${id}" not present`);
    }

    const [[
      updateCount,
      contactedCount,
    ]] = await this.db.query(
      `
    select updateCount, contactedCount from subscriptions where id = ?;
    `,
      [id],
    ) as any;

    const now = new Date();

    await this.db.query(
      `
      update subscriptions
        set lastMaxId         = ?,
            updateCount       = ?,
            contactedCount    = ?,
            lastContactedDate = ?,
            lastUpdateDate    = ?,
            lastStatus        = ?
      where id = ?
      `,
      [
        lastId,
        updateCount + 1,
        contactedCount + 1,
        now.toISOString(),
        now.toISOString(),
        "OK",
        id,
      ],
    );
  }

  async addSubscriptionFailure(id: string): Promise<void> {
    this.assertLoaded();

    const subscriptionRow = await this.db.query(
      `select updateCount, contactedCount, lastContactedDate, lastStatus, lastUpdateDate from subscriptions where id = ?`,
      [id],
    );

    if (subscriptionRow.length === 0) {
      throw new Error(`subscription "${id}" not present`);
    }
  }

  async deleteSubscription(id: string): Promise<DeleteSubscriptionResponse> {
    const previousRow = await this.db.query(
      "select count(*) from subscriptions where id = ?",
      [id],
    );

    await this.db.query("delete from subscriptions where id = ?", [id]);

    return {
      existed: previousRow[0][0] !== 0,
    };
  }

  async cleanup() {
    for (const table of ["batches", "content", "topics"]) {
      await this.db.query(`
      drop table if exists ${table}
      `);
    }

    this.#loaded = false;
  }

  close() {
    return this.db.close();
  }
}
