import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { sqlite } from '../db/client.js';
import type { Space } from '../db/schema.js';
import { requireAuth } from '../lib/session.js';

// ── Prepared statements (module-level, plans cached for the process) ──
const stmtListSpaces = sqlite.prepare<[], SpaceRow>(`
  SELECT id, name, description, icon, sort_order, created_at, updated_at
  FROM spaces
  ORDER BY sort_order, created_at
`);

const stmtGetSpace = sqlite.prepare<[string], SpaceRow>(`
  SELECT id, name, description, icon, sort_order, created_at, updated_at
  FROM spaces WHERE id = ?
`);

const stmtInsertSpace = sqlite.prepare(`
  INSERT INTO spaces (id, name, description, icon, sort_order, created_at, updated_at)
  VALUES (@id, @name, @description, @icon, @sortOrder, @now, @now)
`);

const stmtDeleteSpace = sqlite.prepare<[string]>(`DELETE FROM spaces WHERE id = ?`);

const stmtTree = sqlite.prepare<[string, string], TreeRow>(`
  WITH RECURSIVE tree(id, title, parent_id, sort_order, depth) AS (
    SELECT id, title, parent_id, sort_order, 0
    FROM pages WHERE space_id = ? AND parent_id IS NULL
    UNION ALL
    SELECT p.id, p.title, p.parent_id, p.sort_order, t.depth + 1
    FROM pages p JOIN tree t ON p.parent_id = t.id
    WHERE p.space_id = ?
  )
  SELECT id, title, parent_id, sort_order, depth FROM tree
  ORDER BY depth, sort_order, title
`);

interface SpaceRow {
  id: string;
  name: string;
  description: string;
  icon: string;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

interface TreeRow {
  id: string;
  title: string;
  parent_id: string | null;
  sort_order: number;
  depth: number;
}

interface TreeNode {
  id: string;
  title: string;
  parentId: string | null;
  sortOrder: number;
  depth: number;
  children: TreeNode[];
}

function toSpace(row: SpaceRow): Space {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const createSchema = z.object({
  name: z.string().min(1).max(256),
  description: z.string().max(2000).optional(),
  icon: z.string().max(16).optional(),
});

const updateSchema = z
  .object({
    name: z.string().min(1).max(256).optional(),
    description: z.string().max(2000).optional(),
    icon: z.string().max(16).optional(),
    sortOrder: z.number().int().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'No fields to update' });

export const spacesRouter = new Hono();

spacesRouter.use('*', requireAuth);

// GET / — list all spaces
spacesRouter.get('/', (c) => {
  const rows = stmtListSpaces.all();
  return c.json(rows.map(toSpace));
});

// POST / — create a space
spacesRouter.post('/', zValidator('json', createSchema), (c) => {
  const body = c.req.valid('json');
  const id = uuidv4();
  const now = Math.floor(Date.now() / 1000);

  stmtInsertSpace.run({
    id,
    name: body.name,
    description: body.description ?? '',
    icon: body.icon ?? '📁',
    sortOrder: 0,
    now,
  });

  const row = stmtGetSpace.get(id);
  if (!row) throw new HTTPException(500, { message: 'Failed to create space' });
  return c.json(toSpace(row), 201);
});

// PATCH /:id — update mutable fields
spacesRouter.patch('/:id', zValidator('json', updateSchema), (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json');

  const existing = stmtGetSpace.get(id);
  if (!existing) throw new HTTPException(404, { message: 'Space not found' });

  // Build a dynamic SET clause from only the provided fields.
  const sets: string[] = [];
  const params: Record<string, unknown> = { id, now: Math.floor(Date.now() / 1000) };
  if (body.name !== undefined) {
    sets.push('name = @name');
    params.name = body.name;
  }
  if (body.description !== undefined) {
    sets.push('description = @description');
    params.description = body.description;
  }
  if (body.icon !== undefined) {
    sets.push('icon = @icon');
    params.icon = body.icon;
  }
  if (body.sortOrder !== undefined) {
    sets.push('sort_order = @sortOrder');
    params.sortOrder = body.sortOrder;
  }
  sets.push('updated_at = @now');

  sqlite.prepare(`UPDATE spaces SET ${sets.join(', ')} WHERE id = @id`).run(params);

  const row = stmtGetSpace.get(id);
  return c.json(toSpace(row!));
});

// DELETE /:id — delete space; pages cascade via FK (whole space going away)
spacesRouter.delete('/:id', (c) => {
  const id = c.req.param('id');
  const existing = stmtGetSpace.get(id);
  if (!existing) throw new HTTPException(404, { message: 'Space not found' });

  stmtDeleteSpace.run(id);
  return c.body(null, 204);
});

// GET /:id/tree — nested page tree for the space
spacesRouter.get('/:id/tree', (c) => {
  const id = c.req.param('id');
  const existing = stmtGetSpace.get(id);
  if (!existing) throw new HTTPException(404, { message: 'Space not found' });

  const rows = stmtTree.all(id, id);

  // Assemble flat rows into a nested structure. Rows arrive ordered by depth,
  // so a parent is always materialized before its children.
  const byId = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  for (const r of rows) {
    byId.set(r.id, {
      id: r.id,
      title: r.title,
      parentId: r.parent_id,
      sortOrder: r.sort_order,
      depth: r.depth,
      children: [],
    });
  }

  for (const r of rows) {
    const node = byId.get(r.id)!;
    if (r.parent_id && byId.has(r.parent_id)) {
      byId.get(r.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return c.json(roots);
});
