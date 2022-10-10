import { Client } from "https://deno.land/x/postgres@v0.16.1/mod.ts";
import type {
  AddContentResponse,
  AddTopicResponse,
  GetTopicStatsResponse,
} from "../../interfaces/storage.ts";

const __dirname = new URL(".", import.meta.url).pathname;

const tables = [
  await Deno.readTextFile(__dirname + "tables/topics.sql"),
  await Deno.readTextFile(__dirname + "tables/batches.sql"),
  await Deno.readTextFile(__dirname + "tables/content.sql"),
];

const certificate = await Deno.readTextFile(
  new URL("../../../certificates/ca-certificate.crt", import.meta.url),
);

export class Postgres {
  db: Client;
  #loaded: boolean;

  constructor(cfg: Record<string, any>) {
    this.db = new Client({
      ...cfg,
      tls: {
        caCertificates: [certificate],
        enforce: true,
      },
    });

    this.#loaded = true;
  }

  async init() {
    await this.db.connect();

    for (const table of tables) {
      await this.db.queryArray(table);
    }

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

    return result.rows((row: any) => row[0] as string);
  }

  async getTopic(topic: string): Promise<Topic> {
    this.assertLoaded();
    const result = await this.db.queryArray(
      "select description, created from topics where topic = $1",
      [topic],
    );
    const topicRow = result.rows[0] as any;
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
    const result = await this.db.queryArray(
      `
    select count(*) from content
    where batchId not in (
      select batchId from batches where closed != 'true'
    ) and topic = ?
    `,
      [topic],
    );
    const [[count]] = result.rows;

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

    return {
      existed: rows[0][0] !== 0,
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
      ) and topic = ?
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

  close() {
    return this.db.end();
  }
}
