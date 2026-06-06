import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { zValidator } from '@hono/zod-validator';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { hashPassword, verifyPassword } from '../lib/crypto.js';
import { getSession, requireAuth } from '../lib/session.js';

const KB_USERNAME = process.env.KB_USERNAME ?? '';
let currentPasswordHash = process.env.KB_PASSWORD_HASH ?? '';

// ── Simple in-memory rate limiter (single-user app, no distributed state) ──
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;

interface RateEntry {
  count: number;
  resetAt: number;
}

const attempts = new Map<string, RateEntry>();

/**
 * Returns true if the IP is allowed to attempt, false if throttled.
 * Counts this attempt when allowed.
 */
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);

  if (!entry || now >= entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count += 1;
  return true;
}

// Opportunistic cleanup so the map cannot grow unbounded over a long uptime.
function sweepRateLimit(): void {
  const now = Date.now();
  for (const [ip, entry] of attempts) {
    if (now >= entry.resetAt) attempts.delete(ip);
  }
}
setInterval(sweepRateLimit, RATE_LIMIT_WINDOW_MS).unref();

function clientIp(c: Context): string {
  // Trust X-Forwarded-For first hop when behind a reverse proxy, else fall back
  // to the connection info Hono exposes via the node adapter.
  const fwd = c.req.header('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  const info = c.req.raw.headers.get('x-real-ip');
  return info ?? 'unknown';
}

const loginSchema = z.object({
  username: z.string().min(1).max(256),
  password: z.string().min(1).max(1024),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(1024),
  newPassword: z.string().min(8).max(1024),
});

export const authRouter = new Hono();

authRouter.post('/login', zValidator('json', loginSchema), async (c) => {
  const ip = clientIp(c);
  if (!checkRateLimit(ip)) {
    return c.json({ error: 'Too many attempts. Try again later.' }, 429);
  }

  const { username, password } = c.req.valid('json');

  const usernameOk = username === KB_USERNAME;
  // Always run bcrypt compare (even on bad username) to avoid leaking which
  // field was wrong via response timing.
  const passwordOk = await verifyPassword(password, currentPasswordHash);

  if (!usernameOk || !passwordOk) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const { session, commit } = await getSession(c);
  session.username = KB_USERNAME;
  await session.save();
  commit();

  return c.json({ username: KB_USERNAME }, 200);
});

authRouter.post('/logout', async (c) => {
  const { session, commit } = await getSession(c);
  session.destroy();
  commit();
  return c.json({ ok: true }, 200);
});

authRouter.get('/me', async (c) => {
  const { session } = await getSession(c);
  if (!session.username) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  return c.json({ username: session.username }, 200);
});

authRouter.patch('/password', requireAuth, zValidator('json', changePasswordSchema), async (c) => {
  const { currentPassword, newPassword } = c.req.valid('json');

  const ok = await verifyPassword(currentPassword, currentPasswordHash);
  if (!ok) {
    return c.json({ error: 'Current password is incorrect' }, 400);
  }

  const newHash = await hashPassword(newPassword);

  // Persist to .env file when reachable (dev and self-hosted production).
  const envPath = process.env.KB_ENV_PATH ?? '';
  if (envPath && existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf-8');
    const updated = content.replace(/^KB_PASSWORD_HASH=.*/m, `KB_PASSWORD_HASH=${newHash}`);
    writeFileSync(envPath, updated, 'utf-8');
  }

  // Always update in-memory so subsequent logins use the new hash immediately,
  // even if .env is not writable (containerised / read-only production).
  currentPasswordHash = newHash;
  process.env.KB_PASSWORD_HASH = newHash;

  return c.json({ ok: true }, 200);
});
