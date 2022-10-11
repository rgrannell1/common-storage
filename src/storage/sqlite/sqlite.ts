import type { IStorage } from "../../interfaces/storage.ts";
import type { Topic } from "../../types.ts";
import type {
  AddContentResponse,
  AddTopicResponse,
  GetTopicStatsResponse,
} from "../../interfaces/storage.ts";

import { DB } from "https://deno.land/x/sqlite/mod.ts";

const __dirname = new URL(".", import.meta.url).pathname;

const tables = [
  Deno.readTextFileSync(__dirname + "tables/topics.sql"),
  Deno.readTextFileSync(__dirname + "tables/batches.sql"),
  Deno.readTextFileSync(__dirname + "tables/content.sql"),
];

export class Sqlite implements IStorage {
  db: DB;
  #loaded: boolean;

  constructor(fpath: string) {
    this.db = new DB(fpath);
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
      throw new Error(`topic ${topic} not present`);
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
    batchId: string,
    topic: string,
    content: any[],
  ): Promise<AddContentResponse> {
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

    for (const entry of content) {
      this.db.query(
        `insert into content (batchId, topic, value, created)
        values (?, ?, ?, ?)`,
        [
          batchId,
          topic,
          JSON.stringify(entry),
          Date.now(),
        ],
      );
    }

    return {};
  }

  close() {
    return this.db.close();
  }
}
