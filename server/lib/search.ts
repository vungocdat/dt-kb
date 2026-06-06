import { sqlite } from '../db/client.js';

export interface SearchResult {
  id: string;
  title: string;
  spaceId: string;
  snippet: string;
}

interface SearchRow {
  id: string;
  title: string;
  space_id: string;
  snippet: string;
}

/**
 * Build a safe FTS5 MATCH expression from arbitrary user input.
 *
 * FTS5 query syntax is its own mini-language (AND/OR/NOT, NEAR, column filters,
 * prefix `*`, `-` negation, `^` anchors, parentheses, `"` phrases). Feeding raw
 * user text in risks both syntax errors AND injection of operators. We defuse it
 * by tokenizing on whitespace, double-quote-escaping each token (`"` -> `""`),
 * wrapping each token as a quoted phrase, and appending `*` for prefix matching
 * on the final token so search-as-you-type feels responsive.
 *
 * Returns null when there is nothing searchable.
 */
function sanitizeFtsQuery(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const tokens = trimmed
    .split(/\s+/)
    .map((t) => t.replace(/"/g, ''))
    .filter((t) => t.length > 0);

  if (tokens.length === 0) return null;

  // Quote every token as a literal phrase so operator chars become inert,
  // and add a prefix wildcard on the last token for type-ahead matching.
  return tokens
    .map((t, i) => (i === tokens.length - 1 ? `"${t}"*` : `"${t}"`))
    .join(' ');
}

// Module-level prepared statements (hot path). Two variants: with/without a
// space filter, to keep the bound parameter shapes simple and the plans cached.
const stmtAll = sqlite.prepare<[string], SearchRow>(`
  SELECT
    id,
    space_id,
    title,
    snippet(pages_fts, 3, '<mark>', '</mark>', '…', 20) AS snippet
  FROM pages_fts
  WHERE pages_fts MATCH ?
  ORDER BY rank
  LIMIT 20
`);

const stmtBySpace = sqlite.prepare<[string, string], SearchRow>(`
  SELECT
    id,
    space_id,
    title,
    snippet(pages_fts, 3, '<mark>', '</mark>', '…', 20) AS snippet
  FROM pages_fts
  WHERE pages_fts MATCH ? AND space_id = ?
  ORDER BY rank
  LIMIT 20
`);

/**
 * Full-text search over page titles and content. Optionally scoped to a space.
 * Returns up to 20 results ranked by FTS5 bm25 relevance.
 */
export function searchPages(query: string, spaceId?: string): SearchResult[] {
  const match = sanitizeFtsQuery(query);
  if (match === null) return [];

  const rows =
    spaceId !== undefined && spaceId !== ''
      ? stmtBySpace.all(match, spaceId)
      : stmtAll.all(match);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    spaceId: r.space_id,
    snippet: r.snippet,
  }));
}
