import { Client } from "https://deno.land/x/postgres@v0.16.1/mod.ts";
import type { Topic } from "../../types.ts";
import type {
  AddContentResponse,
  AddTopicResponse,
  GetTopicStatsResponse,
} from "../../interfaces/storage.ts";

const tables = [
  `create table if not exists batches (
    batchId        text primary key,
    closed         text not null,
    created        text not null
  );
  `,
  `create table if not exists content (
    contentId      serial primary key,
    batchId        text not null,
    topic          text not null,
    value          text not null,
    created        text not null
  );
  `,
  `create table if not exists topics (
    topic          text primary key,
    description    text not null,
    created        text not null
  );
  `,
];

export class Postgres {
  db: Client;
  #loaded: boolean;

  constructor(cfg: Record<string, any>) {
    this.db = new Client(cfg);

    this.#loaded = true;
  }

  async init() {
    await this.db.connect();

    await Promise.all(tables.map((table) => {
      return this.db.queryArray(table);
    }));

    this.#loaded = true;
  }

  assertLoaded() {
    if (!this.#loaded) {
      throw new Error("not loaded");
    }
  }

  async getTopicNames() {
    this.assertLoaded();
    const result = await this.db.queryArray<[string]>(
      "select topic from topics",
    );

    return result.rows.map((row) => row[0] as string);
  }

  async getTopic(topic: string): Promise<Topic> {
    this.assertLoaded();
    const result = await this.db.queryArray<[string, string]>(
      "select description, created from topics where topic = $1",
      [topic],
    );
    const topicRow = result.rows[0];
    if (result.rows.length === 0) {
      throw new Error(`topic ${topic} not present`);
    }

    const description = topicRow[0] as string;
    const created = parseInt(topicRow[1] as string);

    try {
      const iso = (new Date(created)).toISOString();
      return {
        name: topic,
        description,
        created: iso,
      };
    } catch (_) {
      throw new Error(`Could not parse "${topicRow[0][1]}" as "created" date.`);
    }
  }

  async getTopicStats(topic: string): Promise<GetTopicStatsResponse> {
    this.assertLoaded();
    const result = await this.db.queryArray(
      `
    select count(*) from content
    where batchId not in (
      select batchId from batches where closed != 'true'
    ) and topic = $1
    `,
      [topic],
    );
    const [[count]] = result.rows;

    return {
      topic: await this.getTopic(topic),
      stats: {
        count: Number(count),
      },
    };
  }

  async addTopic(
    topic: string,
    description: string,
  ): Promise<AddTopicResponse> {
    this.assertLoaded();

    const { rows } = await this.db.queryArray<[number]>(
      "select count(*) from topics where topic = $1",
      [topic],
    );

    await this.db.queryArray<[string, string, number]>(
      `insert into topics(topic, description, created)
        values ($1, $2, $3)
        on conflict (topic) do update
          set description = $2,
          created = $3
      `,
      [
        topic,
        description,
        Date.now(),
      ],
    );

    const existingCount = Number(rows[0][0])

    return {
      existed: existingCount !== 0,
    };
  }

  async #closeBatch(batchId: string) {
    this.assertLoaded();

    const existing = await this.db.queryArray(
      "select created from batches where batchId = ?",
      [batchId],
    );

    await this.db.queryArray(
      `insert into batches(batchId, closed, created)
        values ($1, $2, $3)
        on conflict (batchId) do update
          set closed = $2`,
      [batchId, "true", existing.rows[0][0] as string],
    );
  }

  async getBatch(batchId: string) {
    this.assertLoaded();

    const result = await this.db.queryArray(
      "select closed from batches where batchId = $1",
      [
        batchId,
      ],
    );

    if (result.rows.length === 0) {
      return {
        batchId,
        status: "missing",
      };
    }

    const closed = result.rows[0][0];

    return {
      batchId,
      status: closed === "true" ? "closed" : "open",
    };
  }

  async addBatch(batchId: string) {
    this.assertLoaded();

    const now = Date.now();
    await this.db.queryArray(
      `insert into batches(batchId, closed, created) values ($1, $2, $3)
      on conflict (batchId) do update
        set closed = $2`,
      [batchId, "false", now],
    );
  }

  async getContent(topic: string, startId: string | undefined) {
    this.assertLoaded();

    let result: any;

    if (!startId) {
      result = await this.db.queryArray<[string, string, string]>(
        `
      select contentId, value, created
      from content
      where batchId not in (
        select batchId from batches where closed != 'true'
      ) and topic = $1
      order by contentId
      limit 10
      `,
        [topic],
      );
    } else {
      result = await this.db.queryArray<[string, string, string]>(
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
    for (const row of result.rows) {
      lastId = Math.max(lastId, row[0] as number);
    }

    const res: any = {
      topic,
      startId,
      content: result.rows.map((row: any) => {
        const date = parseInt(row[2]);

        try {
          const iso = (new Date(date)).toISOString();
          return {
            id: row[0],
            value: JSON.parse(row[1]),
            created: iso,
          };
        } catch (_) {
          throw new Error(`Could not parse "${row[2]}" as "created" date.`);
        }
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
    this.assertLoaded();

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
      await this.db.queryArray(
        `insert into content (batchId, topic, value, created)
        values ($1, $2, $3, $4)`,
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

  async cleanup() {
    for (const table of ["batches", "content", "topics"]) {
      await this.db.queryArray(`
      drop table if exists ${table} cascade
      `);
    }

    this.#loaded = false;

    await this.close();
  }

  close() {
    return this.db.end();
  }
}
