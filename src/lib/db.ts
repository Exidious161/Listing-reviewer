import { createClient, type Client, type InArgs, type InValue } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";

export type Database = Client;
export type Row = Record<string, unknown>;

export interface Executor {
  execute(stmt: { sql: string; args?: InArgs }): Promise<{
    rows: Row[];
    lastInsertRowid?: bigint;
    rowsAffected: number;
  }>;
}

export interface PreparedStatement {
  get(...args: InValue[]): Promise<Row | undefined>;
  all(...args: InValue[]): Promise<Row[]>;
  run(...args: InValue[]): Promise<{ lastInsertRowid: number; changes: number }>;
}

/** Thin async wrapper so call sites read like the familiar prepare().get/all/run shape. */
export function prepare(exec: Executor, sql: string): PreparedStatement {
  return {
    async get(...args) {
      const r = await exec.execute({ sql, args });
      return r.rows[0];
    },
    async all(...args) {
      const r = await exec.execute({ sql, args });
      return r.rows;
    },
    async run(...args) {
      const r = await exec.execute({ sql, args });
      return { lastInsertRowid: Number(r.lastInsertRowid ?? 0), changes: r.rowsAffected };
    },
  };
}

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    price TEXT NOT NULL,
    attributes TEXT NOT NULL DEFAULT '{}',
    seller TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    revised TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER NOT NULL REFERENCES listings(id),
    mode TEXT NOT NULL,
    validation TEXT NOT NULL,
    findings TEXT NOT NULL,
    retrieved TEXT NOT NULL,
    warnings TEXT NOT NULL,
    dropped TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  // Append-only: rows are never updated or deleted (enforced by the two triggers below).
  `CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER NOT NULL REFERENCES listings(id),
    review_id INTEGER,
    finding_id TEXT,
    event TEXT NOT NULL,
    field TEXT,
    before_value TEXT,
    after_value TEXT,
    actor TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TRIGGER IF NOT EXISTS history_no_update BEFORE UPDATE ON history
   BEGIN SELECT RAISE(ABORT, 'history is append-only'); END`,
  `CREATE TRIGGER IF NOT EXISTS history_no_delete BEFORE DELETE ON history
   BEGIN SELECT RAISE(ABORT, 'history is append-only'); END`,
  `CREATE INDEX IF NOT EXISTS idx_history_listing ON history(listing_id, id)`,
  `CREATE INDEX IF NOT EXISTS idx_reviews_listing ON reviews(listing_id, id)`,
];

/** `url` is a libsql URL: `:memory:` (tests), `file:./data/app.db` (local disk), or
 * `libsql://...` (Turso, for hosts without a persistent disk). Same engine, same schema,
 * same triggers either way. */
export async function openDb(url: string, authToken?: string): Promise<Database> {
  if (url.startsWith("file:")) {
    const filePath = url.slice("file:".length);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  const client = createClient({ url, authToken });
  await client.migrate(SCHEMA_STATEMENTS);
  return client;
}

/** Interactive transaction: `fn` receives an executor to pass into `prepare()` for every
 * statement that must be part of the same atomic unit. */
export async function runInTransaction<T>(
  db: Database,
  fn: (exec: Executor) => Promise<T>,
): Promise<T> {
  const tx = await db.transaction("write");
  try {
    const result = await fn(tx);
    await tx.commit();
    return result;
  } catch (err) {
    await tx.rollback();
    throw err;
  } finally {
    tx.close();
  }
}

function resolveConnection(): { url: string; authToken?: string } {
  if (process.env.TURSO_DATABASE_URL) {
    return { url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN };
  }
  if (process.env.DATABASE_PATH) return { url: `file:${process.env.DATABASE_PATH}` };
  if (process.env.VERCEL) return { url: "file:/tmp/listing-reviewer.db" };
  return { url: `file:${path.join(process.cwd(), "data", "app.db")}` };
}

const g = globalThis as unknown as { __db?: Promise<Database> };

export function getDb(): Promise<Database> {
  if (!g.__db) {
    const { url, authToken } = resolveConnection();
    g.__db = openDb(url, authToken);
  }
  return g.__db;
}
