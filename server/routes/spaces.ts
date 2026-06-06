import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import JSZip from 'jszip';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { sqlite } from '../db/client.js';
import type { Space } from '../db/schema.js';
import { renderMarkdown } from '../lib/markdown.js';
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

// Export: fetch all pages in a space ordered by sort_order so parents
// generally precede children in the flat list (not guaranteed for all trees,
// but the import loop handles arbitrary ordering via topological sort).
const stmtGetSpacePages = sqlite.prepare<[string], SpacePageRow>(`
  SELECT id, title, content, parent_id, sort_order
  FROM pages
  WHERE space_id = ?
  ORDER BY sort_order ASC
`);

// Import: insert a single page; mirrors stmtInsertPage in pages.ts but local
// to this module to avoid cross-module prepared-statement sharing.
const stmtInsertPageForImport = sqlite.prepare(`
  INSERT INTO pages (id, space_id, parent_id, title, content, content_html,
                     sort_order, created_at, updated_at)
  VALUES (@id, @spaceId, @parentId, @title, @content, @contentHtml,
          @sortOrder, @now, @now)
`);

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

interface SpacePageRow {
  id: string;
  title: string;
  content: string;
  parent_id: string | null;
  sort_order: number;
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

// POST /import — create a space and its pages from a ZIP exported by GET /:id/export
// Declared before GET /:id/tree (and any /:id patterns) so the literal path
// is registered first; Hono matches in declaration order.
const MAX_IMPORT_BYTES = 50 * 1024 * 1024; // 50 MB

interface ImportMeta {
  version: number;
  spaceName: string;
  spaceIcon?: string;
  pages: Array<{
    id: string;
    title: string;
    parentId: string | null;
    sortOrder: number;
    filename: string;
  }>;
}

spacesRouter.post('/import', async (c) => {
  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    throw new HTTPException(400, { message: 'Expected multipart/form-data' });
  }

  const file = formData.get('file');
  if (!file || typeof file === 'string') {
    throw new HTTPException(400, { message: 'Missing file field' });
  }

  const arrayBuffer = await (file as File).arrayBuffer();

  // Guard against oversized uploads before decompression (zip-bomb mitigation).
  if (arrayBuffer.byteLength > MAX_IMPORT_BYTES) {
    throw new HTTPException(413, { message: 'ZIP file exceeds 50 MB limit' });
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(arrayBuffer);
  } catch {
    throw new HTTPException(400, { message: 'Invalid ZIP file' });
  }

  const metaFile = zip.file('_meta.json');
  if (!metaFile) {
    throw new HTTPException(400, { message: 'Missing _meta.json in ZIP' });
  }

  let meta: ImportMeta;
  try {
    meta = JSON.parse(await metaFile.async('string')) as ImportMeta;
  } catch {
    throw new HTTPException(400, { message: 'Invalid _meta.json — not valid JSON' });
  }

  if (!meta.spaceName || typeof meta.spaceName !== 'string') {
    throw new HTTPException(400, { message: 'Invalid _meta.json — missing spaceName' });
  }

  const pages = Array.isArray(meta.pages) ? meta.pages : [];

  // Create space and all pages in a single transaction for atomicity.
  // Pages are resolved in topological order (parents before children) via
  // a processing loop with a cycle guard.
  const spaceId = uuidv4();
  const now = Math.floor(Date.now() / 1000);

  // Pre-render all page content outside the synchronous transaction so we
  // don't block the SQLite write lock while awaiting async markdown rendering.
  const oldToNewId = new Map<string, string>();
  const renderedPages: Array<{
    oldId: string;
    newId: string;
    title: string;
    content: string;
    contentHtml: string;
    parentId: string | null;
    sortOrder: number;
  }> = [];

  // Topological sort: process pages whose parent has already been assigned a
  // new ID (or has no parent). Guard against malformed ZIPs with cycles.
  const remaining = [...pages];
  while (remaining.length > 0) {
    const sizeBefore = remaining.length;
    for (let i = remaining.length - 1; i >= 0; i--) {
      const p = remaining[i];
      if (p.parentId !== null && !oldToNewId.has(p.parentId)) continue;

      const pageFile = zip.file(`pages/${p.filename}`);
      const content = pageFile ? await pageFile.async('string') : '';
      const contentHtml = content ? await renderMarkdown(content) : '';
      const newId = uuidv4();

      oldToNewId.set(p.id, newId);
      renderedPages.push({
        oldId: p.id,
        newId,
        title: p.title ?? 'Untitled',
        content,
        contentHtml,
        parentId: p.parentId,
        sortOrder: p.sortOrder ?? 0,
      });
      remaining.splice(i, 1);
    }
    // Cycle guard: if nothing was processed this pass, stop to avoid an
    // infinite loop. Remaining pages will be inserted as root-level pages.
    if (remaining.length === sizeBefore) {
      for (const p of remaining) {
        const pageFile = zip.file(`pages/${p.filename}`);
        const content = pageFile ? await pageFile.async('string') : '';
        const contentHtml = content ? await renderMarkdown(content) : '';
        const newId = uuidv4();
        oldToNewId.set(p.id, newId);
        renderedPages.push({
          oldId: p.id,
          newId,
          title: p.title ?? 'Untitled',
          content,
          contentHtml,
          parentId: null, // break the cycle by orphaning to root
          sortOrder: p.sortOrder ?? 0,
        });
      }
      break;
    }
  }

  const importTxn = sqlite.transaction(() => {
    stmtInsertSpace.run({
      id: spaceId,
      name: meta.spaceName.slice(0, 256),
      description: '',
      icon: meta.spaceIcon ?? '📁',
      sortOrder: 0,
      now,
    });

    for (const rp of renderedPages) {
      const resolvedParentId = rp.parentId !== null ? (oldToNewId.get(rp.parentId) ?? null) : null;
      stmtInsertPageForImport.run({
        id: rp.newId,
        spaceId,
        parentId: resolvedParentId,
        title: rp.title,
        content: rp.content,
        contentHtml: rp.contentHtml,
        sortOrder: rp.sortOrder,
        now,
      });
    }
  });

  try {
    importTxn();
  } catch (err) {
    console.error('[import] transaction failed:', err);
    throw new HTTPException(500, { message: 'Failed to import space' });
  }

  const space = stmtGetSpace.get(spaceId);
  if (!space) throw new HTTPException(500, { message: 'Failed to retrieve imported space' });
  return c.json(toSpace(space), 201);
});

// GET /:id/export — download the space as a ZIP (pages as .md files + _meta.json)
// Declared after /import (static path) and before /:id/tree (also two-segment,
// no ambiguity in Hono) to keep declaration order semantically clear.
spacesRouter.get('/:id/export', async (c) => {
  const id = c.req.param('id');
  const spaceRow = stmtGetSpace.get(id);
  if (!spaceRow) throw new HTTPException(404, { message: 'Space not found' });

  const pages = stmtGetSpacePages.all(id);

  const zip = new JSZip();
  const usedFilenames = new Set<string>();
  const pagesFolder = zip.folder('pages')!;

  const pageMeta = pages.map((p) => {
    // Sanitize the title into a safe filename. If the title is empty or
    // consists entirely of unsupported characters, fall back to 'untitled'.
    const base =
      p.title
        .replace(/[^a-zA-Z0-9 _-]/g, '')
        .trim()
        .replace(/ +/g, '-')
        .toLowerCase() || 'untitled';

    let filename = `${base}.md`;
    let counter = 1;
    while (usedFilenames.has(filename)) {
      filename = `${base}-${counter++}.md`;
    }
    usedFilenames.add(filename);
    pagesFolder.file(filename, p.content);

    return {
      id: p.id,
      title: p.title,
      parentId: p.parent_id,
      sortOrder: p.sort_order,
      filename,
    };
  });

  const meta = {
    version: 1,
    spaceName: spaceRow.name,
    spaceIcon: spaceRow.icon,
    exportedAt: Math.floor(Date.now() / 1000),
    pages: pageMeta,
  };
  zip.file('_meta.json', JSON.stringify(meta, null, 2));

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

  const safeName =
    spaceRow.name
      .replace(/[^a-zA-Z0-9 _-]/g, '')
      .trim()
      .replace(/ +/g, '-')
      .toLowerCase() || 'space';

  c.header('Content-Type', 'application/zip');
  c.header('Content-Disposition', `attachment; filename="${safeName}.zip"`);
  // Hono's c.body() accepts Uint8Array; Buffer extends Uint8Array at runtime
  // but TypeScript needs the explicit cast since Buffer<ArrayBufferLike> doesn't
  // satisfy the Uint8Array<ArrayBuffer> overload directly.
  return c.body(new Uint8Array(zipBuffer) as Uint8Array<ArrayBuffer>);
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
