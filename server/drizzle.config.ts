import { defineConfig } from 'drizzle-kit';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// drizzle-kit always runs from the server/ directory; default to data/kb.db
// there (server/data/kb.db), which is where the server keeps the DB.
const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH ?? join(__dirname, 'data/kb.db');

export default defineConfig({
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: DB_PATH,
  },
});
