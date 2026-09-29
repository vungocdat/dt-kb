import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { sqlite } from '../db/client.js';
import { requireAuth } from '../lib/session.js';

/**
 * The To-do tab: a single flat list of tasks in the todos table (created in
 * initializeDb()). Unrelated to pages, spaces, search and the calendar.
 *
 * Open tasks are ordered pinned first, then by sort_order (new ones append to
 * the end); finished ones by completed_at, most recent first. A done task keeps
 * its pin, so un-ticking it puts it back at the top.
 */

interface TodoRow {
  id: string;
  title: string;
  done: number;
  sort_order: number;
  pinned: number;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
}

// ── Prepared statements ──

const stmtList = sqlite.prepare<[], TodoRow>(`
  SELECT * FROM todos
  ORDER BY done,
    CASE WHEN done = 0 THEN pinned END DESC,
    CASE WHEN done = 0 THEN sort_order END,
    completed_at DESC
`);

const stmtGet = sqlite.prepare<[string], TodoRow>(`SELECT * FROM todos WHERE id = ?`);

const stmtNextSortOrder = sqlite.prepare<[], { next: number }>(
  `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM todos`,
);

const stmtInsert = sqlite.prepare(`
  INSERT INTO todos (id, title, done, sort_order, created_at, updated_at, completed_at)
  VALUES (@id, @title, 0, @sortOrder, @now, @now, NULL)
`);

const stmtUpdate = sqlite.prepare(`
  UPDATE todos SET
    title = @title, done = @done, pinned = @pinned, completed_at = @completedAt,
    updated_at = @now
  WHERE id = @id
`);

const stmtDelete = sqlite.prepare<[string]>(`DELETE FROM todos WHERE id = ?`);
const stmtDeleteDone = sqlite.prepare(`DELETE FROM todos WHERE done = 1`);

// ── Helpers ──

function toTodo(row: TodoRow) {
  return {
    id: row.id,
    title: row.title,
    done: row.done === 1,
    sortOrder: row.sort_order,
    pinned: row.pinned === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

function requireTodo(id: string): TodoRow {
  const row = stmtGet.get(id);
  if (!row) throw new HTTPException(404, { message: 'Todo not found' });
  return row;
}

const now = () => Math.floor(Date.now() / 1000);

// ── Schemas ──

const title = z.string().trim().min(1, 'title is required').max(500);

const createSchema = z.object({ title });

const updateSchema = z
  .object({
    title: title.optional(),
    done: z.boolean().optional(),
    pinned: z.boolean().optional(),
  })
  .refine((b) => b.title !== undefined || b.done !== undefined || b.pinned !== undefined, {
    message: 'nothing to update',
  });

// ── Router ──

export const todosRouter = new Hono();

todosRouter.use('*', requireAuth);

// GET / — every task, open ones first
todosRouter.get('/', (c) => c.json(stmtList.all().map(toTodo)));

// POST / — add a task to the end of the open list
todosRouter.post('/', zValidator('json', createSchema), (c) => {
  const { title } = c.req.valid('json');
  const id = uuidv4();
  stmtInsert.run({ id, title, sortOrder: stmtNextSortOrder.get()!.next, now: now() });
  return c.json(toTodo(requireTodo(id)), 201);
});

/**
 * DELETE /completed — clear every finished task. Declared before /:id so the
 * literal path wins in Hono's declaration-order matching.
 */
todosRouter.delete('/completed', (c) => {
  const { changes } = stmtDeleteDone.run();
  return c.json({ deleted: changes });
});

// PATCH /:id — rename, tick/untick and/or pin/unpin
todosRouter.patch('/:id', zValidator('json', updateSchema), (c) => {
  const row = requireTodo(c.req.param('id'));
  const body = c.req.valid('json');

  const done = body.done ?? row.done === 1;
  // Keep the original completion time when a done task is only renamed.
  const completedAt = done ? (row.done === 1 ? row.completed_at : now()) : null;

  stmtUpdate.run({
    id: row.id,
    title: body.title ?? row.title,
    done: done ? 1 : 0,
    pinned: (body.pinned ?? row.pinned === 1) ? 1 : 0,
    completedAt,
    now: now(),
  });
  return c.json(toTodo(requireTodo(row.id)));
});

// DELETE /:id — remove one task
todosRouter.delete('/:id', (c) => {
  const row = requireTodo(c.req.param('id'));
  stmtDelete.run(row.id);
  return c.body(null, 204);
});
