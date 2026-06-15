import Database from "better-sqlite3";
import type { Database as Db } from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { env } from "./env";

let _db: Db | null = null;

function init(): Db {
  const dbPath = resolve(process.cwd(), env.dbPath);
  mkdirSync(dirname(dbPath), { recursive: true });
  const d = new Database(dbPath);
  d.pragma("journal_mode = WAL");
  d.pragma("foreign_keys = ON");
  d.exec(SCHEMA);
  return d;
}

function getDb(): Db {
  if (!_db) _db = init();
  return _db;
}

/**
 * Proxy that lazily opens the SQLite DB on first use, so Next.js build-time
 * route collection does not try to acquire a write lock at module load.
 */
export const db: Db = new Proxy({} as Db, {
  get(_t, prop) {
    const d = getDb();
    const v = (d as unknown as Record<string | symbol, unknown>)[prop as string];
    return typeof v === "function" ? (v as (...args: unknown[]) => unknown).bind(d) : v;
  },
});

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  github_id TEXT UNIQUE NOT NULL,
  login TEXT NOT NULL,
  avatar TEXT,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS api_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  prefix TEXT NOT NULL,
  last_used_at INTEGER,
  created_at INTEGER NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  icon TEXT,
  payload TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  payload TEXT,
  ip TEXT,
  ua TEXT,
  created_at INTEGER NOT NULL
);
`;

export function getSetting(key: string): string | undefined {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}
export function setSetting(key: string, value: string) {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, value, Date.now());
}
export function getJSON<T>(key: string, fallback: T): T {
  const v = getSetting(key);
  if (!v) return fallback;
  try { return JSON.parse(v) as T; } catch { return fallback; }
}
export function setJSON(key: string, value: unknown) {
  setSetting(key, JSON.stringify(value));
}
