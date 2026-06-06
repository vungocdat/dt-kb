import { useEffect, useState } from 'react'
import { useUIStore } from '../../store'
import { getSpaces, createSpace, updateSpace, type Space } from '../../api'
import SpaceSection from './SpaceSection'
import { Skeleton } from '../ui/Skeleton'

interface SidebarProps {
  collapsed: boolean
  refreshKey: number
  onPageCreated: () => void
}

export default function Sidebar({ collapsed, refreshKey, onPageCreated }: SidebarProps) {
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const [spaces, setSpaces] = useState<Space[]>([])
  const [loading, setLoading] = useState(true)
  const [creatingSpace, setCreatingSpace] = useState(false)
  const [newSpaceName, setNewSpaceName] = useState('')
  const [draggedSpaceId, setDraggedSpaceId] = useState<string | null>(null)
  const [dragOverSpaceId, setDragOverSpaceId] = useState<string | null>(null)

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
          <span className="flex-1 font-semibold text-gray-100 text-sm tracking-tight truncate">
            kb-markdown
          </span>
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
    </div>
  )
}
