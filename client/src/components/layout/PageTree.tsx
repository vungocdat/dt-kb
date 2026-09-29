import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { getSpaceTree, createPage, deletePage, updatePage, movePage, type PageTreeNode } from '../../api'
import { dragState } from './dragState'
import { confirmDialog } from '../ui/ConfirmDialog'
import { toast } from '../ui/Toaster'
import { ICON_PLUS, ICON_TRASH } from '../ui/icons'

interface PageTreeProps {
  spaceId: string
  parentId: string | null
  depth: number
  tree: PageTreeNode[]
  onTreeLoaded: (tree: PageTreeNode[]) => void
  onPageCreated?: () => void
  onSubpageCreated?: () => Promise<void>
  autoRenameId?: string | null
  onAutoRenameDone?: () => void
  onFocusNewPage?: (pageId: string) => void
}

export default function PageTree({
  spaceId,
  parentId,
  depth,
  tree,
  onTreeLoaded,
  onPageCreated,
  onSubpageCreated,
  autoRenameId,
  onAutoRenameDone,
  onFocusNewPage,
}: PageTreeProps) {
  const params = useParams({ strict: false })
  // pageId param is present on /pages/$pageId route
  const currentPageId = (params as Record<string, string | undefined>).pageId

  const loadedRef = useRef(false)

  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  // 'before' = drop as sibling above the target; 'inside' = nest as a child of the target
  const [dropMode, setDropMode] = useState<'before' | 'inside'>('before')

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
    setDropMode('before')
    dragState.pageId = null
    dragState.spaceId = null
  }

  const handleDragOver = (id: string, mode: 'before' | 'inside') => {
    setDragOverId(id)
    setDropMode(mode)
  }

  const clearDrag = () => {
    setDraggedId(null)
    setDragOverId(null)
    setDropMode('before')
  }

  // True when `ancestorId` is `nodeId` or one of its ancestors — used to block
  // dropping a page into its own subtree.
  const isAncestorOrSelf = (ancestorId: string, nodeId: string | null): boolean => {
    let cur: PageTreeNode | undefined = nodeId ? tree.find((n) => n.id === nodeId) : undefined
    while (cur) {
      if (cur.id === ancestorId) return true
      cur = cur.parentId ? tree.find((n) => n.id === cur!.parentId) : undefined
    }
    return false
  }

  const persistMoves = async (moves: { id: string; parentId: string | null; sortOrder: number }[]) => {
    try {
      await Promise.all(moves.map((m) => movePage(m.id, { parentId: m.parentId, sortOrder: m.sortOrder })))
    } catch {
      // Rollback: reload the tree from the server
      toast.error('Could not move the page.')
      try {
        const fresh = await getSpaceTree(spaceId)
        onTreeLoaded(fresh)
      } catch {
        // silently ignore secondary failure
      }
    }
  }

  const handleDrop = async (targetId: string, mode: 'before' | 'inside') => {
    if (!draggedId || draggedId === targetId) {
      clearDrag()
      return
    }

    const dragged = tree.find((n) => n.id === draggedId)
    const target = tree.find((n) => n.id === targetId)

    if (!dragged || !target) {
      clearDrag()
      return
    }

    if (mode === 'inside') {
      // Nest the dragged page as the last child of the target. Block dropping
      // into the dragged node's own subtree (target is dragged or a descendant).
      if (isAncestorOrSelf(dragged.id, target.id)) {
        clearDrag()
        return
      }

      const siblings = tree.filter((n) => n.parentId === targetId && n.id !== draggedId)
      const newSortOrder = siblings.length

      const updatedTree = tree.map((n) =>
        n.id === draggedId ? { ...n, parentId: targetId, sortOrder: newSortOrder } : n,
      )

      // Reveal the new child by expanding the target (also persists for next mount)
      localStorage.setItem(`kb:page:${targetId}:expanded`, 'true')

      onTreeLoaded(updatedTree)
      clearDrag()

      await persistMoves([{ id: draggedId, parentId: targetId, sortOrder: newSortOrder }])
      return
    }

    // mode === 'before': insert dragged before the target among target's siblings.
    // Block moving a node into its own descendant subtree.
    if (isAncestorOrSelf(dragged.id, target.parentId)) {
      clearDrag()
      return
    }

    const newParentId = target.parentId
    const siblings = tree
      .filter((n) => n.parentId === newParentId && n.id !== draggedId)
      .sort((a, b) => a.sortOrder - b.sortOrder)

    const targetIndex = siblings.findIndex((n) => n.id === targetId)
    siblings.splice(targetIndex, 0, { ...dragged, parentId: newParentId })
    const reindexed = siblings.map((n, i) => ({ ...n, sortOrder: i }))

    // Build the updated flat tree with new parentId and sortOrders applied
    const updatedTree = tree.map((n) => {
      const reindexedNode = reindexed.find((r) => r.id === n.id)
      return reindexedNode ?? n
    })

    // Optimistic update
    onTreeLoaded(updatedTree)
    clearDrag()

    // Persist all affected nodes to the server
    await persistMoves(reindexed.map((n) => ({ id: n.id, parentId: n.parentId, sortOrder: n.sortOrder })))
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
          autoRenameId={autoRenameId}
          onAutoRenameDone={onAutoRenameDone}
          onFocusNewPage={onFocusNewPage}
          draggedId={draggedId}
          dragOverId={dragOverId}
          dropMode={dropMode}
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
  autoRenameId?: string | null
  onAutoRenameDone?: () => void
  onFocusNewPage?: (pageId: string) => void
  draggedId: string | null
  dragOverId: string | null
  dropMode: 'before' | 'inside'
  onDragStart: (id: string) => void
  onDragEnd: () => void
  onDragOver: (id: string, mode: 'before' | 'inside') => void
  onDrop: (targetId: string, mode: 'before' | 'inside') => Promise<void>
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
  autoRenameId,
  onAutoRenameDone,
  onFocusNewPage,
  draggedId,
  dragOverId,
  dropMode,
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
  const isNestTarget = isDragOver && dropMode === 'inside'
  const isBeforeTarget = isDragOver && dropMode === 'before'

  const [expanded, setExpanded] = useState(
    () => localStorage.getItem(`kb:page:${node.id}:expanded`) !== 'false'
  )
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const navigate = useNavigate()
  const renameInputRef = useRef<HTMLInputElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)

  // Drop in the lower half of the row nests the page as a child; the upper half
  // inserts it as a sibling above the target.
  const getDropMode = (e: React.DragEvent): 'before' | 'inside' => {
    const el = rowRef.current
    if (!el) return 'before'
    const rect = el.getBoundingClientRect()
    return e.clientY - rect.top > rect.height / 2 ? 'inside' : 'before'
  }

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

  // A freshly created page opens straight into inline rename. The signal is
  // cleared immediately so it fires once and doesn't re-trigger on re-renders.
  useEffect(() => {
    if (autoRenameId !== node.id) return
    setRenameValue(node.title || '')
    setRenaming(true)
    setTimeout(() => renameInputRef.current?.select(), 0)
    onAutoRenameDone?.()
  }, [autoRenameId, node.id, node.title, onAutoRenameDone])

  const commitRename = async () => {
    const title = renameValue.trim() || 'Untitled'
    setRenaming(false)
    if (title === node.title) return
    try {
      await updatePage(node.id, { title })
      onTreeLoaded(tree.map((n) => (n.id === node.id ? { ...n, title } : n)))
    } catch {
      // node.title prop is unchanged, so the old title simply stays
      toast.error('Could not rename the page.')
    }
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') void commitRename()
    if (e.key === 'Escape') setRenaming(false)
  }

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const ok = await confirmDialog({
      title: `Delete "${node.title || 'Untitled'}"?`,
      message: 'Its child pages move up one level.',
      confirmLabel: 'Delete page',
    })
    if (!ok) return
    try {
      await deletePage(node.id)
      window.dispatchEvent(new CustomEvent('kb:page-deleted', { detail: { spaceId } }))
      // Don't leave the editor showing a page that no longer exists.
      if (isActive) void navigate({ to: '/kb' })
      const fresh = await getSpaceTree(spaceId)
      onTreeLoaded(fresh)
    } catch {
      toast.error('Could not delete the page.')
    }
  }

  const handleAddChild = async (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    try {
      const child = await createPage({ spaceId, title: 'Untitled', parentId: node.id })
      // Expand this row so the new child is visible after the tree remounts.
      localStorage.setItem(`kb:page:${node.id}:expanded`, 'true')
      await onSubpageCreated?.()
      onFocusNewPage?.(child.id)
    } catch {
      toast.error('Could not create the page.')
    }
  }

  // Indentation: 16px per level, with root pages already one level in. The
  // space header's chevron sits at 16px (mx-1 + px-3), so root pages start at
  // 32px — otherwise a space and its direct children look like siblings.
  // The row itself has mx-1 (like the space header), hence 28 here.
  const paddingLeft = 28 + depth * 16

  return (
    <li
      className={isBeforeTarget ? 'border-t-2 border-blue-500' : ''}
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
        onDragOver(node.id, getDropMode(e))
      }}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        void onDrop(node.id, getDropMode(e))
      }}
    >
      <div
        ref={rowRef}
        // Active/hover tint the whole row (indent + chevron + actions), not
        // just the title link, so the highlight lines up with the space header.
        className={`group flex items-center mx-1 rounded transition-colors ${isDragging ? 'opacity-40' : ''} ${
          isNestTarget
            ? 'ring-1 ring-inset ring-blue-500 bg-blue-500/10'
            : isActive
            ? 'bg-blue-600/10'
            : 'hover:bg-gray-800'
        }`}
        style={{ paddingLeft: `${paddingLeft}px` }}
      >
        {/* Expand/collapse toggle */}
        <span className="w-4 flex-shrink-0 text-gray-600">
          {children.length > 0 && (
            <button
              onClick={toggleExpanded}
              aria-expanded={expanded}
              aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.title || 'Untitled'}`}
              className="p-0 rounded hover:text-gray-300 transition-colors"
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
            className={`flex-1 flex items-center py-1 pr-1 text-sm truncate transition-colors ${
              isActive ? 'text-blue-400' : 'text-gray-300 group-hover:text-gray-100'
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

        <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 flex items-center gap-0.5 mr-1 flex-shrink-0 transition-opacity">
          <button
            onClick={(e) => void handleAddChild(e)}
            aria-label={`Add child page under ${node.title}`}
            title="Add child page"
            className="p-0.5 rounded text-gray-400 hover:text-gray-100 hover:bg-gray-700"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ICON_PLUS} />
            </svg>
          </button>
          <button
            onClick={(e) => void handleDelete(e)}
            aria-label={`Delete page ${node.title}`}
            title="Delete page"
            className="p-0.5 rounded text-gray-400 hover:text-red-400 hover:bg-gray-700"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ICON_TRASH} />
            </svg>
          </button>
        </div>
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
              autoRenameId={autoRenameId}
              onAutoRenameDone={onAutoRenameDone}
              onFocusNewPage={onFocusNewPage}
              draggedId={draggedId}
              dragOverId={dragOverId}
              dropMode={dropMode}
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
