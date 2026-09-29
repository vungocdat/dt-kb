import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { sqlite } from '../db/client.js';
import { renderMarkdown } from '../lib/markdown.js';
import { requireAuth } from '../lib/session.js';

/**
 * The journal is a calendar view over ordinary pages — no new page-like table.
 * One space is designated as the journal home; inside it a day note is a plain
 * page titled with an ISO date, nested under year → month parent pages so the
 * sidebar tree stays navigable once there are hundreds of them:
 *
 *   Journal (space)
 *     2026             ← year page,  sort_order = 2026
 *       2026-09        ← month page, sort_order = 9
 *         2026-09-29   ← day note,   sort_order = 29
 *
 * Which space is the journal lives in app_settings (created at runtime in
 * initializeDb(), like pages_fts) rather than as a spaces column, so the feature
 * needs no schema migration and existing databases pick it up on restart. The
 * space stays a completely normal space: renaming, re-icon-ing, dragging pages
 * in and out all keep working.
 *
 * Timezones: day notes are keyed by the *client's* local calendar date, so the
 * client sends both the ISO date strings and the epoch bounds it derived from
 * them. The server never converts between the two — it would have to guess an
 * offset to do so.
 */

const JOURNAL_SPACE_KEY = 'journal_space_id';
const JOURNAL_SPACE_NAME = 'Journal';
const JOURNAL_SPACE_ICON = '📅';

// Cap on the per-month activity list. A personal KB will not come close, but an
// unbounded response is an unbounded response.
const ACTIVITY_LIMIT = 500;

// Matches exactly YYYY-MM-DD, so year ('2026') and month ('2026-09') parent
// pages are excluded from day-note queries even though they sort in range.
const DAY_TITLE_GLOB = '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ── Prepared statements ──

const stmtGetSetting = sqlite.prepare<[string], { value: string }>(
  `SELECT value FROM app_settings WHERE key = ?`,
);

const stmtSetSetting = sqlite.prepare<[string, string]>(`
  INSERT INTO app_settings (key, value) VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);

const stmtDeleteSetting = sqlite.prepare<[string]>(
  `DELETE FROM app_settings WHERE key = ?`,
);

const stmtGetSpace = sqlite.prepare<[string], { id: string; name: string; icon: string }>(
  `SELECT id, name, icon FROM spaces WHERE id = ?`,
);

const stmtInsertSpace = sqlite.prepare(`
  INSERT INTO spaces (id, name, description, icon, sort_order, created_at, updated_at)
  VALUES (@id, @name, '', @icon, @sortOrder, @now, @now)
`);

const stmtNextSpaceSortOrder = sqlite.prepare<[], { next: number }>(
  `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM spaces`,
);

const stmtInsertPage = sqlite.prepare(`
  INSERT INTO pages (id, space_id, parent_id, title, content, content_html,
                     sort_order, created_at, updated_at)
  VALUES (@id, @spaceId, @parentId, @title, @content, @contentHtml,
          @sortOrder, @now, @now)
`);

// parent_id IS ? (not =) so a null parent matches root-level pages.
const stmtFindChildByTitle = sqlite.prepare<
  [string, string | null, string],
  { id: string }
>(`
  SELECT id FROM pages
  WHERE space_id = ? AND parent_id IS ? AND title = ?
  LIMIT 1
`);

// Day notes are looked up space-wide, not under their expected month parent, so
// a note the user dragged elsewhere in the journal is reused rather than
// duplicated.
const stmtFindPageByTitleInSpace = sqlite.prepare<[string, string], { id: string }>(`
  SELECT id FROM pages WHERE space_id = ? AND title = ? LIMIT 1
`);

const stmtDayPagesInRange = sqlite.prepare<
  [string, string, string, string],
  { id: string; title: string }
>(`
  SELECT id, title FROM pages
  WHERE space_id = ? AND title GLOB ? AND title >= ? AND title <= ?
  ORDER BY title
`);

interface ActivityRow {
  id: string;
  title: string;
  space_id: string;
  space_name: string;
  updated_at: number;
}

const stmtActivityInRange = sqlite.prepare<[number, number, number], ActivityRow>(`
  SELECT p.id, p.title, p.space_id, s.name AS space_name, p.updated_at
  FROM pages p JOIN spaces s ON p.space_id = s.id
  WHERE p.updated_at >= ? AND p.updated_at < ?
  ORDER BY p.updated_at DESC
  LIMIT ?
`);

// ── Helpers ──

/**
 * True only for dates that actually exist — the regex alone would accept
 * 2026-02-31. Compared in UTC so the host timezone can't shift the roll-over.
 */
function isRealDate(date: string): boolean {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  );
}

/** '2026-09-29' → 'Tuesday, 29 September 2026' (used as the note's H1). */
function formatLongDate(date: string): string {
  const [y, , d] = date.split('-').map(Number);
  const dt = new Date(`${date}T00:00:00Z`);
  const weekday = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(dt);
  const month = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    timeZone: 'UTC',
  }).format(dt);
  return `${weekday}, ${d} ${month} ${y}`;
}

/**
 * The journal space id, or null if none is designated yet — or if the space it
 * pointed at has since been deleted, in which case the stale pointer is dropped
 * so the next day note starts a fresh journal instead of failing forever.
 */
function resolveJournalSpaceId(): string | null {
  const row = stmtGetSetting.get(JOURNAL_SPACE_KEY);
  if (!row) return null;
  if (!stmtGetSpace.get(row.value)) {
    stmtDeleteSetting.run(JOURNAL_SPACE_KEY);
    return null;
  }
  return row.value;
}

interface EnsureDayArgs {
  date: string;
  content: string;
  contentHtml: string;
  now: number;
}

interface EnsureDayResult {
  pageId: string;
  spaceId: string;
  spaceCreated: boolean;
  created: boolean;
}

/**
 * Get-or-create the journal space, the year and month parent pages, and the day
 * note itself — all in one transaction so a failure part-way can't leave an
 * orphan month page or a journal pointer to a space that wasn't inserted.
 *
 * The day note's HTML must be rendered before this runs: renderMarkdown is async
 * and a better-sqlite3 transaction is strictly synchronous.
 */
const ensureDayTxn = sqlite.transaction((args: EnsureDayArgs): EnsureDayResult => {
  const [year, month, day] = args.date.split('-');

  let spaceId = resolveJournalSpaceId();
  const spaceCreated = spaceId === null;
  if (spaceId === null) {
    spaceId = uuidv4();
    stmtInsertSpace.run({
      id: spaceId,
      name: JOURNAL_SPACE_NAME,
      icon: JOURNAL_SPACE_ICON,
      sortOrder: stmtNextSpaceSortOrder.get()?.next ?? 0,
      now: args.now,
    });
    stmtSetSetting.run(JOURNAL_SPACE_KEY, spaceId);
  }

  const existing = stmtFindPageByTitleInSpace.get(spaceId, args.date);
  if (existing) {
    return { pageId: existing.id, spaceId, spaceCreated, created: false };
  }

  // Year and month containers. sort_order is the numeric year / month so the
  // sidebar lists them chronologically rather than by insertion time.
  const monthTitle = `${year}-${month}`;
  const yearId = ensureContainer(spaceId, null, year, Number(year), args.now);
  const monthId = ensureContainer(spaceId, yearId, monthTitle, Number(month), args.now);

  const pageId = uuidv4();
  stmtInsertPage.run({
    id: pageId,
    spaceId,
    parentId: monthId,
    title: args.date,
    content: args.content,
    contentHtml: args.contentHtml,
    sortOrder: Number(day),
    now: args.now,
  });

  return { pageId, spaceId, spaceCreated, created: true };
});

/** Find or insert an empty structural page (a year or month folder). */
function ensureContainer(
  spaceId: string,
  parentId: string | null,
  title: string,
  sortOrder: number,
  now: number,
): string {
  const found = stmtFindChildByTitle.get(spaceId, parentId, title);
  if (found) return found.id;

  const id = uuidv4();
  stmtInsertPage.run({
    id,
    spaceId,
    parentId,
    title,
    content: '',
    contentHtml: '',
    sortOrder,
    now,
  });
  return id;
}

// ── Schemas ──

const monthQuerySchema = z
  .object({
    from: z.string().regex(ISO_DATE_RE, 'from must be YYYY-MM-DD'),
    to: z.string().regex(ISO_DATE_RE, 'to must be YYYY-MM-DD'),
    startTs: z.coerce.number().int().nonnegative(),
    endTs: z.coerce.number().int().nonnegative(),
  })
  .refine((q) => q.from <= q.to, { message: 'from must not be after to' })
  .refine((q) => q.startTs <= q.endTs, { message: 'startTs must not be after endTs' });

const dayBodySchema = z.object({
  date: z
    .string()
    .regex(ISO_DATE_RE, 'date must be YYYY-MM-DD')
    .refine(isRealDate, { message: 'date is not a real calendar date' }),
});

// ── Router ──

export const journalRouter = new Hono();

journalRouter.use('*', requireAuth);

/**
 * GET /month — everything one calendar view needs, in one request:
 * the day notes whose dates fall in [from, to], and every page edited in
 * [startTs, endTs). Activity rows are returned raw (with epoch timestamps) so
 * the client can bucket them by *its* local date.
 */
journalRouter.get('/month', zValidator('query', monthQuerySchema), (c) => {
  const { from, to, startTs, endTs } = c.req.valid('query');

  const spaceId = resolveJournalSpaceId();
  const spaceRow = spaceId ? stmtGetSpace.get(spaceId) : undefined;

  const days = spaceId
    ? stmtDayPagesInRange
        .all(spaceId, DAY_TITLE_GLOB, from, to)
        .map((r) => ({ date: r.title, pageId: r.id }))
    : [];

  const activity = stmtActivityInRange.all(startTs, endTs, ACTIVITY_LIMIT).map((r) => ({
    id: r.id,
    title: r.title,
    spaceId: r.space_id,
    spaceName: r.space_name,
    updatedAt: r.updated_at,
  }));

  return c.json({
    spaceId: spaceId ?? null,
    spaceName: spaceRow?.name ?? null,
    days,
    activity,
  });
});

/**
 * POST /day — open the note for a date, creating it (and the journal space /
 * year / month scaffolding) on first use. Idempotent: calling it twice for the
 * same date returns the same page with created: false.
 */
journalRouter.post('/day', zValidator('json', dayBodySchema), async (c) => {
  const { date } = c.req.valid('json');

  const content = `# ${formatLongDate(date)}\n\n`;
  const contentHtml = await renderMarkdown(content);

  let result: EnsureDayResult;
  try {
    result = ensureDayTxn({
      date,
      content,
      contentHtml,
      now: Math.floor(Date.now() / 1000),
    });
  } catch (err) {
    console.error('[journal] failed to create day note:', err);
    throw new HTTPException(500, { message: 'Failed to open journal day' });
  }

  return c.json(result, result.created ? 201 : 200);
});
