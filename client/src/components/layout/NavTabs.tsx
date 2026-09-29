import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'

/**
 * The sidebar's top-level tabs. Their order is user-adjustable — drag a tab
 * onto the upper/lower half of another, or focus one and press Alt+↑/↓ — and is
 * remembered per browser in localStorage (same as the space expanded state).
 */

type TabId = 'kb' | 'calendar' | 'todo'

interface TabDef {
  id: TabId
  to: '/' | '/calendar' | '/todo'
  label: string
  /** A tab can own more than one route (Knowledge base covers /pages/*). */
  isActive: (pathname: string) => boolean
  icon: string
}

export const isKnowledgeBasePath = (pathname: string) =>
  pathname === '/' || pathname.startsWith('/pages/')

const TABS: TabDef[] = [
  {
    id: 'kb',
    to: '/',
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

const STORAGE_KEY = 'kb:nav:order'
/** Private dataTransfer type, so drops from page/space drags are ignored here. */
const DRAG_TYPE = 'application/x-kb-tab'

/**
 * The saved order, sanitized: unknown ids dropped, and tabs added after the
 * order was saved appended at the end — so a new tab never goes missing.
 */
function loadOrder(): TabId[] {
  const known = TABS.map((t) => t.id)
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    const valid = Array.isArray(saved)
      ? saved.filter((id, i): id is TabId => known.includes(id) && saved.indexOf(id) === i)
      : []
    return [...valid, ...known.filter((id) => !valid.includes(id))]
  } catch {
    return known
  }
}

function saveOrder(order: TabId[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order))
  } catch {
    // storage unavailable (private mode) — the order just won't persist
  }
}

/** Move `id` to sit before/after `target`. */
function reorder(order: TabId[], id: TabId, target: TabId, pos: 'before' | 'after'): TabId[] {
  if (id === target) return order
  const without = order.filter((t) => t !== id)
  const at = without.indexOf(target) + (pos === 'after' ? 1 : 0)
  return [...without.slice(0, at), id, ...without.slice(at)]
}

interface NavTabsProps {
  collapsed: boolean
  pathname: string
}

export default function NavTabs({ collapsed, pathname }: NavTabsProps) {
  const [order, setOrder] = useState<TabId[]>(loadOrder)
  const [dragging, setDragging] = useState<TabId | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: TabId; pos: 'before' | 'after' } | null>(null)
  const linkRefs = useRef(new Map<TabId, HTMLAnchorElement>())
  // Keyboard moves re-render the list; keep focus on the tab that moved.
  const refocus = useRef<TabId | null>(null)

  useEffect(() => {
    if (!refocus.current) return
    linkRefs.current.get(refocus.current)?.focus()
    refocus.current = null
  }, [order])

  const commit = (next: TabId[]) => {
    setOrder(next)
    saveOrder(next)
  }

  const dropPos = (e: React.DragEvent<HTMLElement>): 'before' | 'after' => {
    const rect = e.currentTarget.getBoundingClientRect()
    return e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
  }

  const endDrag = () => {
    setDragging(null)
    setDropTarget(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent, id: TabId) => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
    e.preventDefault()
    const i = order.indexOf(id)
    const j = e.key === 'ArrowUp' ? i - 1 : i + 1
    if (j < 0 || j >= order.length) return
    refocus.current = id
    commit(reorder(order, id, order[j], e.key === 'ArrowUp' ? 'before' : 'after'))
  }

  return (
    <nav
      aria-label="Tabs"
      className="flex-shrink-0 pt-2 pb-1 space-y-0.5 border-b border-gray-800"
    >
      {order.map((id) => {
        const tab = TABS.find((t) => t.id === id)!
        const active = tab.isActive(pathname)
        const indicator = dropTarget?.id === id && dragging !== id ? dropTarget.pos : null

        return (
          <div key={id} className="relative">
            {indicator && (
              <span
                aria-hidden
                className={`absolute left-2 right-2 h-0.5 rounded bg-blue-500 pointer-events-none ${
                  indicator === 'before' ? '-top-px' : '-bottom-px'
                }`}
              />
            )}
            <Link
              ref={(el) => {
                if (el) linkRefs.current.set(id, el)
                else linkRefs.current.delete(id)
              }}
              to={tab.to}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(DRAG_TYPE, id)
                e.dataTransfer.effectAllowed = 'move'
                setDragging(id)
              }}
              onDragEnd={endDrag}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                const pos = dropPos(e)
                if (dropTarget?.id !== id || dropTarget.pos !== pos) setDropTarget({ id, pos })
              }}
              onDragLeave={() => setDropTarget((t) => (t?.id === id ? null : t))}
              onDrop={(e) => {
                const moved = e.dataTransfer.getData(DRAG_TYPE) as TabId
                if (!moved) return
                e.preventDefault()
                commit(reorder(order, moved, id, dropPos(e)))
                endDrag()
              }}
              onKeyDown={(e) => handleKeyDown(e, id)}
              title={`${collapsed ? `${tab.label} — ` : ''}Drag or Alt+↑/↓ to reorder`}
              aria-label={tab.label}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-2 rounded mx-1 px-3 py-1.5 text-sm transition-colors ${
                active
                  ? 'bg-gray-800 text-gray-100 font-medium'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-gray-100'
              } ${collapsed ? 'justify-center px-2' : ''} ${dragging === id ? 'opacity-40' : ''}`}
            >
              <span className="flex-shrink-0 text-gray-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
                </svg>
              </span>
              {!collapsed && <span className="truncate">{tab.label}</span>}
            </Link>
          </div>
        )
      })}
    </nav>
  )
}
