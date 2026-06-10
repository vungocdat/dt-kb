import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { sqlite } from '../db/client.js';
import type { Page } from '../db/schema.js';
import { renderMarkdown } from '../lib/markdown.js';
import { requireAuth } from '../lib/session.js';

interface PageRow {
  id: string;
  space_id: string;
  parent_id: string | null;
  title: string;
  content: string;
  content_html: string;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

interface PageRowFull extends PageRow {
  space_name: string;
}

interface AncestorRow {
  id: string;
  title: string;
}

interface RecentRow {
  id: string;
  title: string;
  space_id: string;
  space_name: string;
  updated_at: number;
}

// ── Prepared statements ──
const stmtGetPage = sqlite.prepare<[string], PageRow>(`
  SELECT id, space_id, parent_id, title, content, content_html,
         sort_order, created_at, updated_at
  FROM pages WHERE id = ?
`);

const stmtGetPageFull = sqlite.prepare<[string], PageRowFull>(`
  SELECT p.id, p.space_id, p.parent_id, p.title, p.content, p.content_html,
         p.sort_order, p.created_at, p.updated_at, s.name AS space_name
  FROM pages p JOIN spaces s ON p.space_id = s.id
  WHERE p.id = ?
`);

const stmtGetAncestors = sqlite.prepare<[string], AncestorRow>(`
  WITH RECURSIVE anc(id, title, parent_id, lvl) AS (
    SELECT p.id, p.title, p.parent_id, 0
    FROM pages p WHERE p.id = (SELECT parent_id FROM pages WHERE id = ?)
    UNION ALL
    SELECT p.id, p.title, p.parent_id, a.lvl + 1
    FROM pages p JOIN anc a ON p.id = a.parent_id
  )
  SELECT id, title FROM anc ORDER BY lvl DESC
`);

const stmtGetSpace = sqlite.prepare<[string], { id: string }>(
  `SELECT id FROM spaces WHERE id = ?`,
);

const stmtInsertPage = sqlite.prepare(`
  INSERT INTO pages (id, space_id, parent_id, title, content, content_html,
                     sort_order, created_at, updated_at)
  VALUES (@id, @spaceId, @parentId, @title, @content, @contentHtml,
          @sortOrder, @now, @now)
`);

const stmtRecent = sqlite.prepare<[], RecentRow>(`
  SELECT p.id, p.title, p.space_id, s.name AS space_name, p.updated_at
  FROM pages p JOIN spaces s ON p.space_id = s.id
  ORDER BY p.updated_at DESC
  LIMIT 10
`);

// Re-parent children to the deleted page's parent, then delete the page.
const stmtReparentChildren = sqlite.prepare<[string, string]>(`
  UPDATE pages
  SET parent_id = (SELECT parent_id FROM pages WHERE id = ?)
  WHERE parent_id = ?
`);
const stmtDeletePage = sqlite.prepare<[string]>(`DELETE FROM pages WHERE id = ?`);

const deletePageTxn = sqlite.transaction((id: string) => {
  stmtReparentChildren.run(id, id);
  stmtDeletePage.run(id);
});

const stmtUpdateDescendantsSpace = sqlite.prepare(`
  WITH RECURSIVE descendants(id) AS (
    SELECT id FROM pages WHERE id = ?
    UNION ALL
    SELECT p.id FROM pages p JOIN descendants d ON p.parent_id = d.id
  )
  UPDATE pages SET space_id = ? WHERE id IN (SELECT id FROM descendants)
`);

const crossSpaceMoveTxn = sqlite.transaction((id: string, targetSpaceId: string, parentId: string | null, sortOrder: number) => {
  stmtUpdateDescendantsSpace.run(id, targetSpaceId);
  sqlite.prepare(
    `UPDATE pages SET parent_id = ?, sort_order = ?, updated_at = ? WHERE id = ?`
  ).run(parentId, sortOrder, Math.floor(Date.now() / 1000), id);
});

function toPage(row: PageRow): Page {
  return {
    id: row.id,
    spaceId: row.space_id,
    parentId: row.parent_id,
    title: row.title,
    content: row.content,
    contentHtml: row.content_html,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const createSchema = z.object({
  spaceId: z.string().min(1),
  parentId: z.string().min(1).nullable().optional(),
  title: z.string().max(512).optional(),
  content: z.string().optional(),
});

const updateSchema = z
  .object({
    title: z.string().max(512).optional(),
    content: z.string().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'No fields to update' });

const moveSchema = z.object({
  parentId: z.string().min(1).nullable(),
  sortOrder: z.number().int().optional(),
  spaceId: z.string().min(1).optional(),
});

export const pagesRouter = new Hono();

pagesRouter.use('*', requireAuth);

// GET /recent — 10 most recently updated pages (declared before /:id)
pagesRouter.get('/recent', (c) => {
  const rows = stmtRecent.all();
  return c.json(
    rows.map((r) => ({
      id: r.id,
      title: r.title,
      spaceId: r.space_id,
      spaceName: r.space_name,
      updatedAt: r.updated_at,
    })),
  );
});

// GET /:id — full page with space name and ancestor chain
pagesRouter.get('/:id', (c) => {
  const id = c.req.param('id');
  const row = stmtGetPageFull.get(id);
  if (!row) throw new HTTPException(404, { message: 'Page not found' });
  const ancestors = stmtGetAncestors.all(id);
  return c.json({
    ...toPage(row),
    spaceName: row.space_name,
    ancestors: ancestors.map((a) => ({ id: a.id, title: a.title })),
  });
});

// POST / — create a page
pagesRouter.post('/', zValidator('json', createSchema), async (c) => {
  const body = c.req.valid('json');

  if (!stmtGetSpace.get(body.spaceId)) {
    throw new HTTPException(404, { message: 'Space not found' });
  }
  if (body.parentId && !stmtGetPage.get(body.parentId)) {
    throw new HTTPException(404, { message: 'Parent page not found' });
  }

  const id = uuidv4();
  const now = Math.floor(Date.now() / 1000);
  const content = body.content ?? '';
  const contentHtml = content ? await renderMarkdown(content) : '';

  stmtInsertPage.run({
    id,
    spaceId: body.spaceId,
    parentId: body.parentId ?? null,
    title: body.title ?? 'Untitled',
    content,
    contentHtml,
    sortOrder: 0,
    now,
  });

  const row = stmtGetPage.get(id);
  if (!row) throw new HTTPException(500, { message: 'Failed to create page' });
  return c.json(toPage(row), 201);
});

// PATCH /:id — update title and/or content (re-render on content change)
pagesRouter.patch('/:id', zValidator('json', updateSchema), async (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json');

  const existing = stmtGetPage.get(id);
  if (!existing) throw new HTTPException(404, { message: 'Page not found' });

  const sets: string[] = [];
  const params: Record<string, unknown> = { id, now: Math.floor(Date.now() / 1000) };

  if (body.title !== undefined) {
    sets.push('title = @title');
    params.title = body.title;
  }
  if (body.content !== undefined) {
    sets.push('content = @content', 'content_html = @contentHtml');
    params.content = body.content;
    params.contentHtml = body.content ? await renderMarkdown(body.content) : '';
  }
  sets.push('updated_at = @now');

  sqlite.prepare(`UPDATE pages SET ${sets.join(', ')} WHERE id = @id`).run(params);

  // Same shape as GET /:id — the client swaps this into page state, so it must
  // carry spaceName and ancestors or the breadcrumb breaks.
  const row = stmtGetPageFull.get(id);
  const ancestors = stmtGetAncestors.all(id);
  return c.json({
    ...toPage(row!),
    spaceName: row!.space_name,
    ancestors: ancestors.map((a) => ({ id: a.id, title: a.title })),
  });
});

// DELETE /:id — re-parent children up, then delete (transactional)
pagesRouter.delete('/:id', (c) => {
  const id = c.req.param('id');
  if (!stmtGetPage.get(id)) throw new HTTPException(404, { message: 'Page not found' });

  deletePageTxn(id);
  return c.body(null, 204);
});

// PATCH /:id/move — change parent and/or ordering, optionally across spaces
pagesRouter.patch('/:id/move', zValidator('json', moveSchema), (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json');

  const existing = stmtGetPage.get(id);
  if (!existing) throw new HTTPException(404, { message: 'Page not found' });

  if (body.parentId === id) {
    throw new HTTPException(400, { message: 'A page cannot be its own parent' });
  }

  const targetSpaceId = body.spaceId ?? existing.space_id;

  if (body.parentId) {
    const parent = stmtGetPage.get(body.parentId);
    if (!parent) throw new HTTPException(404, { message: 'Parent page not found' });
    if (parent.space_id !== targetSpaceId) {
      throw new HTTPException(400, { message: 'Parent page is in a different space' });
    }
  }

  const sortOrder = body.sortOrder ?? existing.sort_order;

  if (targetSpaceId !== existing.space_id) {
    crossSpaceMoveTxn(id, targetSpaceId, body.parentId ?? null, sortOrder);
  } else {
    sqlite
      .prepare(
        `UPDATE pages SET parent_id = ?, sort_order = ?, updated_at = ? WHERE id = ?`,
      )
      .run(body.parentId, sortOrder, Math.floor(Date.now() / 1000), id);
  }

  const row = stmtGetPage.get(id);
  return c.json(toPage(row!));
});
