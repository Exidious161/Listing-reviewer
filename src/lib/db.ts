import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  price TEXT NOT NULL,
  attributes TEXT NOT NULL DEFAULT '{}',
  seller TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  revised TEXT NOT NULL DEFAULT '{}',   -- field -> approved/edited replacement value
  status TEXT NOT NULL DEFAULT 'new',   -- new | reviewed | in_review | finalized
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL REFERENCES listings(id),
  mode TEXT NOT NULL,
  validation TEXT NOT NULL,
  findings TEXT NOT NULL,
  retrieved TEXT NOT NULL,
  warnings TEXT NOT NULL,
  dropped TEXT NOT NULL,
  created_at TEXT NOT NULL
);
-- Append-only: rows are never updated or deleted.
CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL REFERENCES listings(id),
  review_id INTEGER,
  finding_id TEXT,
  event TEXT NOT NULL,        -- created | reviewed | approved | edited | rejected | reverted | finalized
  field TEXT,
  before_value TEXT,
  after_value TEXT,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS history_no_update BEFORE UPDATE ON history
BEGIN SELECT RAISE(ABORT, 'history is append-only'); END;
CREATE TRIGGER IF NOT EXISTS history_no_delete BEFORE DELETE ON history
BEGIN SELECT RAISE(ABORT, 'history is append-only'); END;
CREATE INDEX IF NOT EXISTS idx_history_listing ON history(listing_id, id);
CREATE INDEX IF NOT EXISTS idx_reviews_listing ON reviews(listing_id, id);
`;

export function openDb(file: string): Database.Database {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

function defaultPath(): string {
  if (process.env.DATABASE_PATH) return process.env.DATABASE_PATH;
  if (process.env.VERCEL) return "/tmp/listing-reviewer.db";
  return path.join(process.cwd(), "data", "app.db");
}

const g = globalThis as unknown as { __db?: Database.Database };

export function getDb(): Database.Database {
  if (!g.__db) g.__db = openDb(defaultPath());
  return g.__db;
}
