import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { getSpaceTree, createPage, deletePage, updatePage, movePage, type PageTreeNode } from '../../api'
import { dragState } from './dragState'

interface PageTreeProps {
  spaceId: string
  parentId: string | null
  depth: number
  tree: PageTreeNode[]
  onTreeLoaded: (tree: PageTreeNode[]) => void
  onPageCreated?: () => void
  onSubpageCreated?: () => Promise<void>
}

export default function PageTree({
  spaceId,
  parentId,
  depth,
  tree,
  onTreeLoaded,
  onPageCreated,
  onSubpageCreated,
}: PageTreeProps) {
  const params = useParams({ strict: false })
  // pageId param is present on /pages/$pageId route
  const currentPageId = (params as Record<string, string | undefined>).pageId

  const loadedRef = useRef(false)

  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    const load = async () => {
      try {
        const data = await getSpaceTree(spaceId)
        onTreeLoaded(data)
      } catch {
        // silently fail — tree stays empty
      }
    }
    void load()
  }, [spaceId, onTreeLoaded])

  const handleDragStart = (id: string) => {
    setDraggedId(id)
    dragState.pageId = id
    dragState.spaceId = spaceId
  }

  const handleDragEnd = () => {
    setDraggedId(null)
    setDragOverId(null)
    dragState.pageId = null
    dragState.spaceId = null
  }

  const handleDragOver = (id: string) => {
    setDragOverId(id)
  }

  const handleDrop = async (targetId: string) => {
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null)
      setDragOverId(null)
      return
    }

    const dragged = tree.find((n) => n.id === draggedId)
    const target = tree.find((n) => n.id === targetId)

    // Only allow reordering within the same parent (siblings)
    if (!dragged || !target || dragged.parentId !== target.parentId) {
      setDraggedId(null)
      setDragOverId(null)
      return
    }

    const siblings = tree
      .filter((n) => n.parentId === dragged.parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder)

    const withoutDragged = siblings.filter((n) => n.id !== draggedId)
    const targetIndex = withoutDragged.findIndex((n) => n.id === targetId)
    // Insert dragged before the target
    withoutDragged.splice(targetIndex, 0, dragged)
    const reindexed = withoutDragged.map((n, i) => ({ ...n, sortOrder: i }))

    // Build the updated flat tree with new sortOrders applied
    const updatedTree = tree.map((n) => {
      const reindexedNode = reindexed.find((r) => r.id === n.id)
      return reindexedNode ?? n
    })

    // Optimistic update
    onTreeLoaded(updatedTree)
    setDraggedId(null)
    setDragOverId(null)

    // Persist each changed node's sortOrder to the server
    try {
      await Promise.all(
        reindexed.map((n) => movePage(n.id, { parentId: n.parentId, sortOrder: n.sortOrder })),
      )
    } catch {
      // Rollback: reload the tree from the server
      try {
        const fresh = await getSpaceTree(spaceId)
        onTreeLoaded(fresh)
      } catch {
        // silently ignore secondary failure
      }
    }
  }

  const rootNodes = tree
    .filter((n) => n.parentId === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  if (rootNodes.length === 0) return null

  return (
    <ul>
      {rootNodes.map((node) => (
        <PageTreeItem
          key={node.id}
          node={node}
          spaceId={spaceId}
          tree={tree}
          depth={depth}
          currentPageId={currentPageId}
          onTreeLoaded={onTreeLoaded}
          onPageCreated={onPageCreated}
          onSubpageCreated={onSubpageCreated}
          draggedId={draggedId}
          dragOverId={dragOverId}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        />
      ))}
    </ul>
  )
}

interface PageTreeItemProps {
  node: PageTreeNode
  spaceId: string
  tree: PageTreeNode[]
  depth: number
  currentPageId: string | undefined
  onTreeLoaded: (tree: PageTreeNode[]) => void
  onPageCreated?: () => void
  onSubpageCreated?: () => Promise<void>
  draggedId: string | null
  dragOverId: string | null
  onDragStart: (id: string) => void
  onDragEnd: () => void
  onDragOver: (id: string) => void
  onDrop: (targetId: string) => Promise<void>
}

function PageTreeItem({
  node,
  spaceId,
  tree,
  depth,
  currentPageId,
  onTreeLoaded,
  onPageCreated,
  onSubpageCreated,
  draggedId,
  dragOverId,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: PageTreeItemProps) {
  const children = tree
    .filter((n) => n.parentId === node.id)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const isActive = currentPageId === node.id
  const isDragging = draggedId === node.id
  const isDragOver = dragOverId === node.id

  const [expanded, setExpanded] = useState(
    () => localStorage.getItem(`kb:page:${node.id}:expanded`) !== 'false'
  )
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const renameInputRef = useRef<HTMLInputElement>(null)

  const toggleExpanded = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setExpanded((v) => {
      const next = !v
      localStorage.setItem(`kb:page:${node.id}:expanded`, String(next))
      return next
    })
  }

  const startRenaming = (e: React.MouseEvent) => {
    e.preventDefault()
    setRenameValue(node.title || '')
    setRenaming(true)
    setTimeout(() => renameInputRef.current?.select(), 0)
  }

  const commitRename = async () => {
    const title = renameValue.trim() || 'Untitled'
    setRenaming(false)
    if (title === node.title) return
    try {
      await updatePage(node.id, { title })
      onTreeLoaded(tree.map((n) => (n.id === node.id ? { ...n, title } : n)))
    } catch {
      // silently revert — node.title prop is unchanged
    }
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') void commitRename()
    if (e.key === 'Escape') setRenaming(false)
  }

  const handleDeleteConfirmed = async (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    try {
      await deletePage(node.id)
      const fresh = await getSpaceTree(spaceId)
      onTreeLoaded(fresh)
    } catch {
      setConfirmingDelete(false)
    }
  }

  const handleAddChild = async (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    try {
      await createPage({ spaceId, title: 'Untitled', parentId: node.id })
      await onSubpageCreated?.()
    } catch {
      // silently ignore
    }
  }

  // Indentation: 12px base + 16px per depth level
  const paddingLeft = 12 + depth * 16

  return (
    <li
      className={isDragOver ? 'border-t-2 border-blue-500' : ''}
      draggable
      onDragStart={(e) => {
        e.stopPropagation()
        onDragStart(node.id)
      }}
      onDragEnd={(e) => {
        e.stopPropagation()
        onDragEnd()
      }}
      onDragOver={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onDragOver(node.id)
      }}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        void onDrop(node.id)
      }}
    >
      <div
        className={`group flex items-center transition-opacity ${isDragging ? 'opacity-40' : 'opacity-100'}`}
        style={{ paddingLeft: `${paddingLeft}px` }}
      >
        {/* Expand/collapse toggle */}
        <span className="w-4 flex-shrink-0 text-gray-600">
          {children.length > 0 && (
            <button
              onClick={toggleExpanded}
              aria-label={expanded ? 'Collapse' : 'Expand'}
              className="p-0 hover:text-gray-300 transition-colors"
            >
              <svg
                className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </span>

        {renaming ? (
          <input
            ref={renameInputRef}
            type="text"
            value={renameValue}
            autoFocus
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={() => void commitRename()}
            onKeyDown={handleRenameKeyDown}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 bg-gray-800 border border-gray-600 rounded px-1.5 py-0.5 text-gray-100 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        ) : (
          <Link
            to="/pages/$pageId"
            params={{ pageId: node.id }}
            className={`flex-1 flex items-center py-1 pr-1 text-sm rounded-sm truncate transition-colors ${
              isActive
                ? 'text-blue-400 bg-blue-600/10'
                : 'text-gray-300 hover:text-gray-100 hover:bg-gray-800'
            }`}
          >
            <span
              className="truncate"
              onDoubleClick={startRenaming}
              title="Double-click to rename"
            >
              {node.title || 'Untitled'}
            </span>
          </Link>
        )}

        {confirmingDelete ? (
          <div className="flex items-center flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <span className="text-xs text-gray-400 mr-1">Delete?</span>
            <button
              onClick={(e) => void handleDeleteConfirmed(e)}
              aria-label={`Confirm delete ${node.title}`}
              className="text-xs text-red-400 hover:text-red-300 px-1 py-0.5 rounded hover:bg-red-900/30"
            >
              Delete
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmingDelete(false) }}
              aria-label="Cancel delete"
              className="text-xs text-gray-400 hover:text-gray-300 px-1 py-0.5 rounded hover:bg-gray-700 ml-0.5"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 mr-2 flex-shrink-0 transition-opacity">
            <button
              onClick={(e) => void handleAddChild(e)}
              aria-label={`Add child page under ${node.title}`}
              title="Add child page"
              className="p-0.5 rounded text-gray-400 hover:text-gray-100 hover:bg-gray-700"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); setConfirmingDelete(true) }}
              aria-label={`Delete page ${node.title}`}
              className="p-0.5 rounded text-gray-400 hover:text-red-400 hover:bg-gray-700"
            >
              <svg
                className="w-3 h-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Render children recursively */}
      {children.length > 0 && expanded && (
        <ul>
          {children.map((child) => (
            <PageTreeItem
              key={child.id}
              node={child}
              spaceId={spaceId}
              tree={tree}
              depth={depth + 1}
              currentPageId={currentPageId}
              onTreeLoaded={onTreeLoaded}
              onPageCreated={onPageCreated}
              onSubpageCreated={onSubpageCreated}
              draggedId={draggedId}
              dragOverId={dragOverId}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragOver={onDragOver}
              onDrop={onDrop}
            />
          ))}
        </ul>
      )}
    </li>
  )
}
