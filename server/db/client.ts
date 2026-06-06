import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.js';

// Resolve default DB path relative to this file so it is CWD-independent.
// db/client.ts lives in server/db/, so ../../data/kb.db → project root/data/kb.db.
const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = join(__dirname, '../../data/kb.db');
const DB_PATH = process.env.DB_PATH ?? DEFAULT_DB_PATH;

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
 * Apply PRAGMAs and create FTS5 virtual table + sync triggers. Idempotent.
 * Call AFTER migrations have created the base tables.
 */
export function initializeDb(): void {
  // PRAGMAs — WAL for concurrent reads, FK enforcement, write-contention timeout.
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');

  sqlite.exec(`
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
