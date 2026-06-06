import { defineConfig } from 'drizzle-kit';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// drizzle-kit always runs from the server/ directory, so default to
// ../data/kb.db (project root) to match where the server expects the DB.
const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH ?? join(__dirname, '../data/kb.db');

export default defineConfig({
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: DB_PATH,
  },
});
