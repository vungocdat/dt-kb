import { getIronSession, type IronSession, type SessionOptions } from 'iron-session';
import type { Context, MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';

export interface SessionData {
  username: string;
}

export const COOKIE_NAME = 'kb_session';
const SEVEN_DAYS_SECONDS = 60 * 60 * 24 * 7;

const SESSION_SECRET = process.env.SESSION_SECRET ?? '';

// Validate at module load — fail fast, never boot with a weak/short secret.
if (SESSION_SECRET.length !== 32) {
  throw new Error(
    `SESSION_SECRET must be exactly 32 characters (got ${SESSION_SECRET.length}). ` +
      'Generate one with: npm run setup -- --username <u> --password <p>',
  );
}

export const sessionOptions: SessionOptions = {
  cookieName: COOKIE_NAME,
  password: SESSION_SECRET,
  cookieOptions: {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SEVEN_DAYS_SECONDS,
    path: '/',
  },
};

// Hono context variable map additions.
declare module 'hono' {
  interface ContextVariableMap {
    session: IronSession<SessionData>;
  }
}

/**
 * Copy any Set-Cookie headers iron-session wrote onto its scratch Response
 * over to the real Hono response. iron-session v8 mutates the Response it is
 * handed when session.save()/destroy() is called, so we read from there.
 */
function commitCookies(c: Context, scratch: Response): void {
  // getSetCookie() returns all Set-Cookie entries (handles multiples correctly).
  const setCookies = scratch.headers.getSetCookie();
  for (const cookie of setCookies) {
    c.header('Set-Cookie', cookie, { append: true });
  }
}

/**
 * Load the iron-session for a request and return it alongside a commit() helper.
 * commit() must be called AFTER save()/destroy() to flush Set-Cookie to Hono.
 *
 * Used directly by login/logout where the session is mutated.
 */
export async function getSession(
  c: Context,
): Promise<{ session: IronSession<SessionData>; commit: () => void }> {
  const scratch = new Response();
  const session = await getIronSession<SessionData>(c.req.raw, scratch, sessionOptions);
  return { session, commit: () => commitCookies(c, scratch) };
}

/**
 * Auth guard middleware. Loads the session, rejects with a generic 401 when no
 * username is present, otherwise stores the session on the context for handlers.
 *
 * Also re-commits the session cookie so the sliding 7-day expiry is refreshed
 * on every authenticated request.
 */
export const requireAuth: MiddlewareHandler = createMiddleware(async (c, next) => {
  const scratch = new Response();
  const session = await getIronSession<SessionData>(c.req.raw, scratch, sessionOptions);

  if (!session.username) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  c.set('session', session);
  await next();

  // Slide the expiry: re-save then flush the refreshed cookie onto the response.
  await session.save();
  commitCookies(c, scratch);
});
