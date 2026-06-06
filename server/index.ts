import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Load .env from the project root (one level up from server/).
// Must run before any other import reads process.env.
const __dirname = dirname(fileURLToPath(import.meta.url));
const envFilePath = resolve(__dirname, '../.env');
loadEnv({ path: envFilePath });
process.env.KB_ENV_PATH = envFilePath;

import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { logger } from 'hono/logger';
import { loadConfig } from './lib/env.js';

/**
 * Bootstrap order is load-bearing:
 *   1. loadConfig()        — fail fast on bad env BEFORE anything reads it.
 *   2. runMigrations + initializeDb — base tables, then FTS + triggers + PRAGMAs.
 *   3. dynamic import of routes — their module-level prepared statements compile
 *      against an already-initialized schema (FTS table must exist first).
 *
 * Routes are imported dynamically (not top-level) precisely so the DB is ready
 * before search.ts / pages.ts prepare statements at module load.
 */
async function main(): Promise<void> {
  const config = loadConfig();

  const { runMigrations, initializeDb } = await import('./db/client.js');
  runMigrations();
  initializeDb();

  const { authRouter } = await import('./routes/auth.js');
  const { spacesRouter } = await import('./routes/spaces.js');
  const { pagesRouter } = await import('./routes/pages.js');
  const { searchRouter } = await import('./routes/search.js');

  const app = new Hono();

  app.use('*', logger());

  // ── API ──────────────────────────────────────────────────────────────────
  const api = new Hono();
  // auth is public (login/logout/me self-guard); the others guard themselves
  // via requireAuth applied inside each sub-router.
  api.route('/auth', authRouter);
  api.route('/spaces', spacesRouter);
  api.route('/pages', pagesRouter);
  api.route('/search', searchRouter);

  app.route('/api', api);

  // Centralized error handler — never leak internal/SQLite error text.
  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json({ error: err.message }, err.status);
    }
    console.error('[unhandled]', err);
    return c.json({ error: 'Internal server error' }, 500);
  });

  // ── Static + SPA fallback (production) ─────────────────────────────────────
  if (config.isProduction) {
    app.use('/*', serveStatic({ root: './public' }));
    // Any non-API, non-asset path falls back to the SPA shell.
    app.notFound(async (c) => {
      if (c.req.path.startsWith('/api')) {
        return c.json({ error: 'Not found' }, 404);
      }
      const res = await serveStatic({ path: './public/index.html' })(c, async () => {});
      return res ?? c.json({ error: 'Not found' }, 404);
    });
  } else {
    app.notFound((c) => c.json({ error: 'Not found' }, 404));
  }

  serve({ fetch: app.fetch, port: config.port, hostname: '0.0.0.0' }, (info) => {
    console.log(`dt-kb API listening on http://0.0.0.0:${info.port}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
