import { useEffect, useRef, useState } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { useUIStore } from '../../store'
import { getSpaces, createSpace, importSpace, updateSpace, type Space } from '../../api'
import SpaceSection from './SpaceSection'
import { Skeleton } from '../ui/Skeleton'

interface SidebarProps {
  collapsed: boolean
  refreshKey: number
  onPageCreated: () => void
}

interface NavItemProps {
  to: '/' | '/calendar' | '/todo'
  label: string
  collapsed: boolean
  /** Computed from the pathname, so a tab can own more than one route. */
  active: boolean
  children: React.ReactNode
}

/** A top-level tab in the sidebar nav. */
function NavItem({ to, label, collapsed, active, children }: NavItemProps) {
  return (
    <Link
      to={to}
      title={collapsed ? label : undefined}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-2 rounded mx-1 px-3 py-1.5 text-sm transition-colors ${
        active
          ? 'bg-gray-800 text-gray-100 font-medium'
          : 'text-gray-300 hover:bg-gray-800 hover:text-gray-100'
      } ${collapsed ? 'justify-center px-2' : ''}`}
    >
      <span className="flex-shrink-0 text-gray-400">{children}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  )
}

export default function Sidebar({ collapsed, refreshKey, onPageCreated }: SidebarProps) {
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  // The Knowledge base tab owns its landing page and every page route; only
  // there does the sidebar show the space tree.
  const inKnowledgeBase = pathname === '/' || pathname.startsWith('/pages/')
  const [spaces, setSpaces] = useState<Space[]>([])
  const [loading, setLoading] = useState(true)
  const [creatingSpace, setCreatingSpace] = useState(false)
  const [newSpaceName, setNewSpaceName] = useState('')
  const [draggedSpaceId, setDraggedSpaceId] = useState<string | null>(null)
  const [dragOverSpaceId, setDragOverSpaceId] = useState<string | null>(null)
  const importSpaceInputRef = useRef<HTMLInputElement>(null)

  const loadSpaces = async () => {
    try {
      const data = await getSpaces()
      setSpaces(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadSpaces()
  }, [refreshKey])

  const handleImportSpace = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    try {
      await importSpace(file)
      await loadSpaces()
    } catch {
      // silently fail
    }
  }

  const handleCreateSpace = async () => {
    const name = newSpaceName.trim()
    if (!name) return
    try {
      const space = await createSpace({ name, description: '', icon: '📁' })
      setSpaces((prev) => [...prev, space])
      setNewSpaceName('')
      setCreatingSpace(false)
    } catch {
      // ignore for now — could show inline error
    }
  }

  const handleNewSpaceKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') void handleCreateSpace()
    if (e.key === 'Escape') {
      setCreatingSpace(false)
      setNewSpaceName('')
    }
  }

  const handleSpaceDrop = async (targetId: string) => {
    if (!draggedSpaceId || draggedSpaceId === targetId) {
      setDraggedSpaceId(null)
      setDragOverSpaceId(null)
      return
    }
    const sorted = [...spaces].sort((a, b) => a.sortOrder - b.sortOrder)
    const dragged = sorted.find((s) => s.id === draggedSpaceId)!
    const withoutDragged = sorted.filter((s) => s.id !== draggedSpaceId)
    const targetIndex = withoutDragged.findIndex((s) => s.id === targetId)
    withoutDragged.splice(targetIndex, 0, dragged)
    const reindexed = withoutDragged.map((s, i) => ({ ...s, sortOrder: i }))

    // Optimistic update
    setSpaces(reindexed)
    setDraggedSpaceId(null)
    setDragOverSpaceId(null)

    // Persist
    try {
      await Promise.all(reindexed.map((s) => updateSpace(s.id, { sortOrder: s.sortOrder })))
    } catch {
      // Reload on failure to restore server state
      try {
        const data = await getSpaces()
        setSpaces(data)
      } catch {
        // ignore secondary failure
      }
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Branding + collapse toggle */}
      <div className="flex items-center h-12 px-3 border-b border-gray-800 flex-shrink-0">
        {!collapsed && (
          <Link to="/" className="flex-1 font-semibold text-gray-100 text-sm tracking-tight truncate hover:text-blue-400 transition-colors">
            DT workspace
          </Link>
        )}
        <button
          onClick={toggleSidebar}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="p-1 rounded text-gray-400 hover:text-gray-100 hover:bg-gray-700 transition-colors flex-shrink-0"
        >
          {collapsed ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          )}
        </button>
      </div>

      {/* Fixed destinations — stay put above the scrolling space list */}
      <nav className="flex-shrink-0 pt-2 pb-1 space-y-0.5 border-b border-gray-800">
        <NavItem to="/" label="Knowledge base" collapsed={collapsed} active={inKnowledgeBase}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        </NavItem>
        <NavItem to="/calendar" label="Calendar" collapsed={collapsed} active={pathname === '/calendar'}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </NavItem>
        <NavItem to="/todo" label="To-do" collapsed={collapsed} active={pathname === '/todo'}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        </NavItem>
      </nav>

      {inKnowledgeBase ? (
        <>
          {/* Spaces list */}
          <div className="flex-1 overflow-y-auto py-2">
            {loading ? (
              <div className="space-y-2 px-3 mt-2">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-5/6" />
                <Skeleton className="h-6 w-4/6" />
              </div>
            ) : (
              [...spaces]
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((space) => (
                  <div
                    key={space.id}
                    draggable
                    onDragStart={(e) => {
                      e.stopPropagation()
                      setDraggedSpaceId(space.id)
                    }}
                    onDragEnd={() => {
                      setDraggedSpaceId(null)
                      setDragOverSpaceId(null)
                    }}
                    onDragOver={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setDragOverSpaceId(space.id)
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      void handleSpaceDrop(space.id)
                    }}
                    className={`border-t-2 transition-opacity ${dragOverSpaceId === space.id ? 'border-blue-500' : 'border-transparent'} ${draggedSpaceId === space.id ? 'opacity-40' : ''}`}
                  >
                    <SpaceSection
                      space={space}
                      collapsed={collapsed}
                      onPageCreated={onPageCreated}
                      onSpaceUpdated={(updated) =>
                        setSpaces((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
                      }
                      onSpaceDeleted={(id) =>
                        setSpaces((prev) => prev.filter((s) => s.id !== id))
                      }
                    />
                  </div>
                ))
            )}
          </div>

          {/* New space */}
          {!collapsed && (
            <div className="border-t border-gray-800 p-3 flex-shrink-0">
              {creatingSpace ? (
                <input
                  autoFocus
                  type="text"
                  value={newSpaceName}
                  onChange={(e) => setNewSpaceName(e.target.value)}
                  onKeyDown={handleNewSpaceKeyDown}
                  onBlur={() => {
                    if (!newSpaceName.trim()) {
                      setCreatingSpace(false)
                    }
                  }}
                  placeholder="Space name…"
                  className="w-full px-2 py-1 text-sm bg-gray-800 border border-gray-600 rounded text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              ) : (
                <button
                  onClick={() => setCreatingSpace(true)}
                  className="w-full flex items-center gap-2 text-sm text-gray-400 hover:text-gray-100 hover:bg-gray-800 px-2 py-1.5 rounded transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Space
                </button>
              )}
            </div>
          )}

          {/* Import space */}
          {!collapsed && (
            <div className="px-3 py-2 border-t border-gray-800 flex-shrink-0">
              <button
                onClick={() => importSpaceInputRef.current?.click()}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-gray-400 hover:text-gray-100 hover:bg-gray-800 rounded transition-colors"
                title="Import space from ZIP"
              >
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12" />
                </svg>
                Import Space
              </button>
              <input
                ref={importSpaceInputRef}
                type="file"
                accept=".zip,application/zip"
                className="hidden"
                onChange={(e) => void handleImportSpace(e)}
              />
            </div>
          )}
        </>
      ) : (
        <div className="flex-1" />
      )}
    </div>
  )
}
