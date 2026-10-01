import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.js';

// index.ts pins the working directory to server/, so this (and any relative
// DB_PATH from .env) resolves to server/data/kb.db in dev and production alike.
const DB_PATH = process.env.DB_PATH ?? './data/kb.db';

/**
 * Resolve and ensure the directory for the SQLite file exists before opening.
 */
function ensureDbDirectory(path: string): string {
  const resolved = resolve(path);
  const dir = dirname(resolved);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return resolved;
}

/**
 * The raw better-sqlite3 connection (synchronous). Use this for prepared
 * statements, FTS queries, and CTEs. Module-level singleton — one connection
 * for the whole process.
 */
export const sqlite: Database.Database = new Database(ensureDbDirectory(DB_PATH));

/**
 * Drizzle wrapper over the same connection. Use for schema-typed CRUD.
 * Never run a separate Drizzle connection — same physical connection only.
 */
export const db: BetterSQLite3Database<typeof schema> = drizzle(sqlite, { schema });

/**
 * Apply PRAGMAs and create the runtime-managed tables: the FTS5 virtual table
 * with its sync triggers, calendar_notes and todos. Idempotent.
 * Call AFTER migrations have created the base tables.
 */
export function initializeDb(): void {
  // PRAGMAs — WAL for concurrent reads, FK enforcement, write-contention timeout.
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');

  sqlite.exec(`
    -- calendar_notes: the calendar's own storage, deliberately unrelated to
    -- pages. One note per calendar date, keyed by the date itself — no space,
    -- no parent, no FK, and no FTS triggers: nothing here shows up in the page
    -- tree or in search. Created at runtime (not via a Drizzle migration) so
    -- existing databases pick it up on restart without a manual
    -- "drizzle-kit push" — same reasoning as pages_fts below.
    CREATE TABLE IF NOT EXISTS calendar_notes (
      date         TEXT PRIMARY KEY,
      content      TEXT NOT NULL DEFAULT '',
      content_html TEXT NOT NULL DEFAULT '',
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL
    );

    -- todos: the To-do tab's storage, a flat list unrelated to pages and to
    -- the calendar. done and pinned are 0/1; completed_at is set while done so
    -- finished items can be listed most-recent first. Runtime-created for the
    -- same reason as calendar_notes.
    CREATE TABLE IF NOT EXISTS todos (
      id           TEXT PRIMARY KEY,
      title        TEXT NOT NULL,
      done         INTEGER NOT NULL DEFAULT 0,
      sort_order   INTEGER NOT NULL,
      pinned       INTEGER NOT NULL DEFAULT 0,
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL,
      completed_at INTEGER
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
      id UNINDEXED,
      space_id UNINDEXED,
      title,
      content
    );

    CREATE TRIGGER IF NOT EXISTS pages_ai AFTER INSERT ON pages BEGIN
      INSERT INTO pages_fts(id, space_id, title, content)
      VALUES (new.id, new.space_id, new.title, new.content);
    END;

    CREATE TRIGGER IF NOT EXISTS pages_au AFTER UPDATE OF title, content ON pages BEGIN
      DELETE FROM pages_fts WHERE id = old.id;
      INSERT INTO pages_fts(id, space_id, title, content)
      VALUES (new.id, new.space_id, new.title, new.content);
    END;

    CREATE TRIGGER IF NOT EXISTS pages_ad AFTER DELETE ON pages BEGIN
      DELETE FROM pages_fts WHERE id = old.id;
    END;
  `);

  // Columns added to runtime tables after they first shipped. CREATE TABLE IF
  // NOT EXISTS leaves an existing table alone, so add any that are missing.
  addColumnIfMissing('todos', 'pinned', 'INTEGER NOT NULL DEFAULT 0');
}

function addColumnIfMissing(table: string, column: string, definition: string): void {
  const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((c) => c.name === column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

/**
 * Run Drizzle migrations from db/migrations against the given connection.
 * Used at startup before initializeDb().
 */
export function runMigrations(database: BetterSQLite3Database<typeof schema> = db): void {
  // If the schema was already applied out-of-band (e.g. via `drizzle-kit push`,
  // which is what the documented `npm run db:migrate` does and which does NOT
  // record into __drizzle_migrations), the Drizzle file-migrator would attempt
  // to re-run 0000_init.sql and fail with "table already exists". Detect that
  // case and skip the file migrator — the schema is already present.
  const tableExists = sqlite
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'pages'`,
    )
    .get();
  const migrationsTracked = sqlite
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'`,
    )
    .get();

  if (tableExists && !migrationsTracked) {
    // Pushed schema, no migration ledger — nothing safe for the file migrator
    // to do. Schema is current; leave it alone.
    return;
  }

  migrate(database, { migrationsFolder: resolve('./db/migrations') });
}
