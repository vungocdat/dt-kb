/**
 * The app's top-level tabs and the user's navigation preferences for them:
 * the sidebar order and which tab is the default page (where `/` lands).
 * Both are remembered per browser in localStorage, like the space expanded
 * state. Plain module (no components) so the router, the sidebar and Settings
 * can all share it.
 */

export type TabId = 'kb' | 'calendar' | 'todo'

export interface TabDef {
  id: TabId
  to: '/kb' | '/calendar' | '/todo'
  label: string
  /** A tab can own more than one route (Knowledge base covers /pages/*). */
  isActive: (pathname: string) => boolean
  icon: string
}

export const isKnowledgeBasePath = (pathname: string) =>
  pathname === '/kb' || pathname.startsWith('/pages/')

export const TABS: TabDef[] = [
  {
    id: 'kb',
    to: '/kb',
    label: 'Knowledge base',
    isActive: isKnowledgeBasePath,
    icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  },
  {
    id: 'calendar',
    to: '/calendar',
    label: 'Calendar',
    isActive: (p) => p === '/calendar',
    icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  },
  {
    id: 'todo',
    to: '/todo',
    label: 'To-do',
    isActive: (p) => p === '/todo',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  },
]

const ORDER_KEY = 'kb:nav:order'
/**
 * The saved order, sanitized: unknown ids dropped, and tabs added after the
 * order was saved appended at the end — so a new tab never goes missing.
 */
export function loadTabOrder(): TabId[] {
  const known = TABS.map((t) => t.id)
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(ORDER_KEY) ?? '[]')
    const valid = Array.isArray(saved)
      ? saved.filter((id, i): id is TabId => known.includes(id) && saved.indexOf(id) === i)
      : []
    return [...valid, ...known.filter((id) => !valid.includes(id))]
  } catch {
    return known
  }
}

export function saveTabOrder(order: TabId[]) {
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify(order))
  } catch {
    // storage unavailable (private mode) — the order just won't persist
  }
}

/** Move `id` to sit before/after `target`. */
export function reorderTabs(order: TabId[], id: TabId, target: TabId, pos: 'before' | 'after'): TabId[] {
  if (id === target) return order
  const without = order.filter((t) => t !== id)
  const at = without.indexOf(target) + (pos === 'after' ? 1 : 0)
  return [...without.slice(0, at), id, ...without.slice(at)]
}

// ── Default page ──────────────────────────────────────────────────────────────

const DEFAULT_KEY = 'kb:nav:default'
/** Used until the user picks one, and if the saved id no longer exists. */
const FALLBACK_DEFAULT: TabId = 'calendar'

/** The tab `/` redirects to. */
export function loadDefaultTab(): TabDef {
  let id: string | null = null
  try {
    id = localStorage.getItem(DEFAULT_KEY)
  } catch {
    // storage unavailable — use the fallback
  }
  return TABS.find((t) => t.id === id) ?? TABS.find((t) => t.id === FALLBACK_DEFAULT)!
}

export function saveDefaultTab(id: TabId) {
  try {
    localStorage.setItem(DEFAULT_KEY, id)
  } catch {
    // storage unavailable (private mode) — the choice just won't persist
  }
}
