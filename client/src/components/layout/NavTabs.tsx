import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'

import { loadTabOrder, reorderTabs, saveTabOrder, TABS, type TabId } from '../../lib/tabs'

/**
 * The sidebar's top-level tabs. Their order is user-adjustable — drag a tab
 * onto the upper/lower half of another, or focus one and press Alt+↑/↓. Tab
 * definitions and the saved order live in lib/tabs.ts.
 */

/** Private dataTransfer type, so drops from page/space drags are ignored here. */
const DRAG_TYPE = 'application/x-kb-tab'

interface NavTabsProps {
  collapsed: boolean
  pathname: string
}

export default function NavTabs({ collapsed, pathname }: NavTabsProps) {
  const [order, setOrder] = useState<TabId[]>(loadTabOrder)
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
    saveTabOrder(next)
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
    commit(reorderTabs(order, id, order[j], e.key === 'ArrowUp' ? 'before' : 'after'))
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
                commit(reorderTabs(order, moved, id, dropPos(e)))
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
