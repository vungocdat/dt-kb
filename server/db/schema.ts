import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * spaces — top-level containers for pages.
 * id is a UUID string PK.
 */
export const spaces = sqliteTable('spaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  icon: text('icon').notNull().default('📁'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at')
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at')
    .notNull()
    .default(sql`(unixepoch())`),
});

/**
 * pages — markdown documents, optionally nested via self-referential parent_id.
 *
 * NOTE: parent_id is intentionally NOT a Drizzle foreign key. Deletion re-parents
 * children (handled in app code / triggers), so a hard FK constraint would fight
 * the re-parenting transaction. space_id IS a real FK so deleting a space cascades.
 */
export const pages = sqliteTable(
  'pages',
  {
    id: text('id').primaryKey(),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    parentId: text('parent_id'),
    title: text('title').notNull().default('Untitled'),
    content: text('content').notNull().default(''),
    contentHtml: text('content_html').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: integer('created_at')
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at')
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    spaceIdIdx: index('pages_space_id_idx').on(table.spaceId),
    parentIdIdx: index('pages_parent_id_idx').on(table.parentId),
    updatedAtIdx: index('pages_updated_at_idx').on(table.updatedAt),
  }),
);

export type Space = typeof spaces.$inferSelect;
export type NewSpace = typeof spaces.$inferInsert;
export type Page = typeof pages.$inferSelect;
export type NewPage = typeof pages.$inferInsert;
