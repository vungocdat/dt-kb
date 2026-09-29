import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useRouteContext, useRouterState } from '@tanstack/react-router'
import { useUIStore } from '../../store'
import { getSpaces, createSpace, importSpace, logout, updateSpace, type Space } from '../../api'
import { ICON_PLUS, ICON_UPLOAD } from '../ui/icons'
import { toast } from '../ui/Toaster'
import SpaceSection from './SpaceSection'
import NavTabs from './NavTabs'
import { isKnowledgeBasePath } from '../../lib/tabs'
import { Skeleton } from '../ui/Skeleton'

interface SidebarProps {
  collapsed: boolean
  refreshKey: number
  onPageCreated: () => void
}

export default function Sidebar({ collapsed, refreshKey, onPageCreated }: SidebarProps) {
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen)
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  // The Knowledge base tab owns its landing page and every page route; only
  // there does the sidebar show the space tree.
  const inKnowledgeBase = isKnowledgeBasePath(pathname)
  const [spaces, setSpaces] = useState<Space[]>([])
  const [loading, setLoading] = useState(true)
  const [creatingSpace, setCreatingSpace] = useState(false)
  const [newSpaceName, setNewSpaceName] = useState('')
  const [draggedSpaceId, setDraggedSpaceId] = useState<string | null>(null)
  const [dragOverSpaceId, setDragOverSpaceId] = useState<string | null>(null)
  const importSpaceInputRef = useRef<HTMLInputElement>(null)
  const { username } = useRouteContext({ from: '/_auth' })
  const navigate = useNavigate()

  const handleLogout = async () => {
    try {
      await logout()
    } finally {
      await navigate({ to: '/login' })
    }
  }

  const loadSpaces = async () => {
    try {
      const data = await getSpaces()
      setSpaces(data)
    } catch {
      toast.error('Could not load spaces.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadSpaces()
  }, [refreshKey])

  // Tell the knowledge-base landing page its space cards are stale.
  const announceSpacesChanged = () => window.dispatchEvent(new CustomEvent('kb:spaces-changed'))

  // The landing page's empty state has "New space" / "Import from ZIP" buttons;
  // they reuse the sidebar's own UI rather than duplicating it.
  useEffect(() => {
    const onNewSpace = () => {
      setSidebarOpen(true)
      setCreatingSpace(true)
    }
    // Runs synchronously inside the button's click, so the file picker is allowed to open.
    const onImportSpace = () => importSpaceInputRef.current?.click()
    window.addEventListener('kb:new-space', onNewSpace)
    window.addEventListener('kb:import-space', onImportSpace)
    return () => {
      window.removeEventListener('kb:new-space', onNewSpace)
      window.removeEventListener('kb:import-space', onImportSpace)
    }
  }, [setSidebarOpen])

  const handleImportSpace = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    try {
      await importSpace(file)
      await loadSpaces()
      announceSpacesChanged()
      toast.success(`Imported ${file.name}.`)
    } catch {
      toast.error(`Could not import ${file.name}. Is it a space export ZIP?`)
    }
  }

  const handleCreateSpace = async () => {
    const name = newSpaceName.trim()
    if (!name) return
    try {
      const space = await createSpace({ name, description: '', icon: '📁' })
      setSpaces((prev) => [...prev, space])
      announceSpacesChanged()
      setNewSpaceName('')
      setCreatingSpace(false)
    } catch {
      toast.error('Could not create the space.')
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
      announceSpacesChanged()
    } catch {
      // Reload on failure to restore server state
      toast.error('Could not reorder spaces.')
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

      {/* Top-level tabs — user-reorderable, stay put above the scrolling space list */}
      <NavTabs collapsed={collapsed} pathname={pathname} />

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
                      onSpaceUpdated={(updated) => {
                        setSpaces((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
                        announceSpacesChanged()
                      }}
                      onSpaceDeleted={(id) => {
                        setSpaces((prev) => prev.filter((s) => s.id !== id))
                        announceSpacesChanged()
                      }}
                    />
                  </div>
                ))
            )}
          </div>

          {/* New space + import — one row */}
          {!collapsed && (
            <div className="border-t border-gray-800 p-2 flex-shrink-0">
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
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCreatingSpace(true)}
                    className="flex-1 flex items-center gap-2 text-sm text-gray-400 hover:text-gray-100 hover:bg-gray-800 px-2 py-1.5 rounded transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ICON_PLUS} />
                    </svg>
                    New space
                  </button>
                  <button
                    onClick={() => importSpaceInputRef.current?.click()}
                    aria-label="Import space from ZIP"
                    title="Import space from ZIP"
                    className="p-1.5 rounded text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ICON_UPLOAD} />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Outside the !collapsed block so the landing page can open it even with the rail collapsed */}
          <input
            ref={importSpaceInputRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(e) => void handleImportSpace(e)}
          />
        </>
      ) : (
        <div className="flex-1" />
      )}

      {/* Account: who's signed in, settings and log out */}
      <div
        className={`border-t border-gray-800 p-2 flex-shrink-0 flex items-center gap-1 ${
          collapsed ? 'flex-col' : ''
        }`}
      >
        {!collapsed && (
          <div className="flex-1 min-w-0 flex items-center gap-2 px-1">
            <span
              aria-hidden
              className="w-6 h-6 flex-shrink-0 rounded-full bg-gray-700 text-gray-200 text-xs font-semibold flex items-center justify-center"
            >
              {username.charAt(0).toUpperCase()}
            </span>
            <span className="text-sm text-gray-300 truncate" title={username}>
              {username}
            </span>
          </div>
        )}
        <Link
          to="/settings"
          aria-label="Settings"
          title="Settings"
          className={`p-1.5 rounded transition-colors ${
            pathname === '/settings'
              ? 'bg-gray-800 text-gray-100'
              : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </Link>
        <button
          onClick={() => void handleLogout()}
          aria-label="Log out"
          title="Log out"
          className="p-1.5 rounded text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </div>
    </div>
  )
}
