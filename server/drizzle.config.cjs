// CommonJS config for drizzle-kit — the ESM drizzle.config.ts triggers a
// "require is not defined" error because server/ has "type":"module".
// drizzle-kit always loads .cjs files as CommonJS regardless of that setting.
const path = require('path');
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/kb.db');

module.exports = {
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'sqlite',
  dbCredentials: { url: DB_PATH },
};
