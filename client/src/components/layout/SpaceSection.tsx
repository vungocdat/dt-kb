import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { createPage, deleteSpace, exportSpace, getSpaceTree, movePage, updateSpace, type Space, type PageTreeNode } from '../../api'
import PageTree from './PageTree'
import { dragState } from './dragState'
import EmojiPicker from '../ui/EmojiPicker'
import Menu from '../ui/Menu'
import { ICON_DOWNLOAD, ICON_PLUS, ICON_TRASH, ICON_UPLOAD } from '../ui/icons'

interface SpaceSectionProps {
  space: Space
  collapsed: boolean
  onPageCreated: () => void
  onSpaceUpdated?: (updated: Space) => void
  onSpaceDeleted?: (id: string) => void
}

export default function SpaceSection({
  space,
  collapsed,
  onPageCreated,
  onSpaceUpdated,
  onSpaceDeleted,
}: SpaceSectionProps) {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(
    () => localStorage.getItem(`kb:space:${space.id}:expanded`) === 'true'
  )
  const [tree, setTree] = useState<PageTreeNode[]>([])
  // Page id that should auto-open into inline rename right after creation.
  const [autoRenameId, setAutoRenameId] = useState<string | null>(null)
  const [treeVersion, setTreeVersion] = useState(0)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [pickerAnchor, setPickerAnchor] = useState<{ left: number; bottom: number } | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const importPageInputRef = useRef<HTMLInputElement>(null)
  const deletingRef = useRef(false)
  const dragCounter = useRef(0)

  const refreshTree = async () => {
    try {
      const data = await getSpaceTree(space.id)
      setTree(data)
    } catch {
      // silently ignore
    }
  }

  useEffect(() => {
    const handler = async (e: Event) => {
      const { spaceId: deletedSpaceId } = (e as CustomEvent<{ spaceId: string }>).detail
      if (deletedSpaceId !== space.id) return
      try {
        const data = await getSpaceTree(space.id)
        setTree(data)
      } catch {}
    }
    window.addEventListener('kb:page-deleted', handler as EventListener)
    return () => window.removeEventListener('kb:page-deleted', handler as EventListener)
  }, [space.id])

  const startRenaming = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    setRenameValue(space.name)
    setRenaming(true)
    setTimeout(() => renameInputRef.current?.select(), 0)
  }

  const commitRename = async () => {
    const name = renameValue.trim()
    setRenaming(false)
    if (!name || name === space.name) return
    try {
      const updated = await updateSpace(space.id, { name })
      onSpaceUpdated?.(updated)
    } catch {
      // revert silently — space.name prop is unchanged
    }
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') void commitRename()
    if (e.key === 'Escape') setRenaming(false)
  }

  const toggleIconPicker = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (pickerAnchor) {
      setPickerAnchor(null)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    setPickerAnchor({ left: rect.left, bottom: rect.bottom })
  }

  const handleIconSelect = async (icon: string) => {
    setPickerAnchor(null)
    if (icon === space.icon) return
    try {
      const updated = await updateSpace(space.id, { icon })
      onSpaceUpdated?.(updated)
    } catch {
      // revert silently — space.icon prop is unchanged
    }
  }

  const handleExportSpace = async () => {
    try {
      const blob = await exportSpace(space.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${space.name}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // silently fail
    }
  }

  const handleImportPage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const content = await file.text()
    const title = file.name.replace(/\.md$/i, '') || 'Untitled'
    try {
      await createPage({ spaceId: space.id, title, content })
      await refreshTree()
      setTreeVersion((v) => v + 1)
      onPageCreated()
    } catch {
      // silently fail
    }
  }

  // Open the new page (highlights it in the sidebar via the route param) and
  // flag it so the matching tree row opens straight into inline rename.
  const focusNewPage = (pageId: string) => {
    setAutoRenameId(pageId)
    void navigate({ to: '/pages/$pageId', params: { pageId } })
  }

  const handleAddPage = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const page = await createPage({ spaceId: space.id, title: 'Untitled', parentId: null })
      setExpanded(true)
      localStorage.setItem(`kb:space:${space.id}:expanded`, 'true')
      await refreshTree()
      setTreeVersion((v) => v + 1)
      onPageCreated()
      focusNewPage(page.id)
    } catch {
      // ignore
    }
  }

  const handleDeleteConfirmed = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (deletingRef.current) return
    deletingRef.current = true
    try {
      await deleteSpace(space.id)
      onSpaceDeleted?.(space.id)
    } catch {
      // Reset UI on error — don't leave the confirm prompt open
      setConfirmingDelete(false)
    } finally {
      deletingRef.current = false
    }
  }

  const handleDragEnter = (e: React.DragEvent) => {
    if (!dragState.pageId || dragState.spaceId === space.id) return
    e.preventDefault()
    dragCounter.current++
    setIsDragOver(true)
  }

  const handleDragLeave = () => {
    dragCounter.current--
    if (dragCounter.current === 0) setIsDragOver(false)
  }

  const handleDragOver = (e: React.DragEvent) => {
    if (!dragState.pageId || dragState.spaceId === space.id) return
    e.preventDefault()
  }

  const handleSpaceDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current = 0
    setIsDragOver(false)
    if (!dragState.pageId || dragState.spaceId === space.id) return

    const sourcePageId = dragState.pageId
    const sourceSpaceId = dragState.spaceId

    try {
      await movePage(sourcePageId, { parentId: null, spaceId: space.id })
      if (sourceSpaceId) {
        window.dispatchEvent(new CustomEvent('kb:page-deleted', { detail: { spaceId: sourceSpaceId } }))
      }
      await refreshTree()
      setExpanded(true)
      localStorage.setItem(`kb:space:${space.id}:expanded`, 'true')
    } catch {
      // silently fail
    }
  }

  if (collapsed) {
    return (
      <div
        className="px-2 py-1.5 flex items-center justify-center text-lg cursor-pointer hover:bg-gray-800 rounded mx-1 my-0.5"
        title={space.name}
        onClick={() => setExpanded((v) => { const next = !v; localStorage.setItem(`kb:space:${space.id}:expanded`, String(next)); return next })}
      >
        <span>{space.icon || '📁'}</span>
      </div>
    )
  }

  return (
    <div
      className={`mb-1 rounded transition-colors ${isDragOver ? 'ring-1 ring-blue-500 bg-blue-500/5' : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={(e) => void handleSpaceDrop(e)}
    >
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 cursor-pointer hover:bg-gray-800 rounded mx-1 group select-none"
        onClick={() => { if (!confirmingDelete) setExpanded((v) => { const next = !v; localStorage.setItem(`kb:space:${space.id}:expanded`, String(next)); return next }) }}
      >
        <svg
          className={`w-3 h-3 text-gray-500 flex-shrink-0 transition-transform ${
            expanded ? 'rotate-90' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
        <button
          onClick={toggleIconPicker}
          onMouseDown={(e) => e.stopPropagation()}
          aria-label={`Change icon for ${space.name}`}
          title="Click to change icon"
          className="text-sm flex-shrink-0 rounded hover:bg-gray-700 px-0.5 transition-colors"
        >
          {space.icon || '📁'}
        </button>
        {renaming ? (
          <input
            ref={renameInputRef}
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={() => void commitRename()}
            onKeyDown={handleRenameKeyDown}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 bg-gray-800 border border-gray-600 rounded px-1.5 py-0 text-gray-100 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        ) : (
          <span
            className="flex-1 text-sm text-gray-200 font-medium truncate"
            onDoubleClick={startRenaming}
            title="Double-click to rename"
          >
            {space.name}
          </span>
        )}
        {confirmingDelete ? (
          <div className="flex items-center flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <span className="text-xs text-gray-400 mr-1">Delete space?</span>
            <button
              onClick={handleDeleteConfirmed}
              aria-label={`Confirm delete ${space.name}`}
              className="text-xs text-red-400 hover:text-red-300 px-1.5 py-0.5 rounded hover:bg-red-900/30"
            >
              Delete
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmingDelete(false) }}
              aria-label="Cancel delete"
              className="text-xs text-gray-400 hover:text-gray-300 px-1.5 py-0.5 rounded hover:bg-gray-700 ml-0.5"
            >
              Cancel
            </button>
          </div>
        ) : (
          // Revealed on row hover, while focused, and while the menu is open
          <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100 transition-opacity">
            <button
              onClick={handleAddPage}
              aria-label={`New page in ${space.name}`}
              title="New page"
              className="p-0.5 rounded text-gray-400 hover:text-gray-100 hover:bg-gray-700"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ICON_PLUS} />
              </svg>
            </button>
            <Menu
              label={`Actions for ${space.name}`}
              align="right"
              triggerClassName="p-0.5 rounded text-gray-400 hover:text-gray-100 hover:bg-gray-700"
              items={[
                { label: 'Rename', icon: 'M15.232 5.232l3.536 3.536M9 13l6.232-6.232a2.5 2.5 0 113.536 3.536L12.536 16.5H9V13z', onSelect: () => startRenaming() },
                { label: 'Import .md page…', icon: ICON_UPLOAD, onSelect: () => importPageInputRef.current?.click() },
                { label: 'Export as ZIP', icon: ICON_DOWNLOAD, onSelect: () => void handleExportSpace() },
                { label: 'Delete space…', icon: ICON_TRASH, danger: true, onSelect: () => setConfirmingDelete(true) },
              ]}
            />
          </div>
        )}
      </div>

      {/* Hidden file input for .md import (opened from the space menu) */}
      <input
        ref={importPageInputRef}
        type="file"
        accept=".md,text/markdown"
        className="hidden"
        onChange={(e) => void handleImportPage(e)}
      />

      {pickerAnchor && (
        <EmojiPicker
          anchor={pickerAnchor}
          onSelect={(emoji) => void handleIconSelect(emoji)}
          onClose={() => setPickerAnchor(null)}
        />
      )}

      {expanded && (
        <PageTree
          key={treeVersion}
          spaceId={space.id}
          parentId={null}
          depth={0}
          tree={tree}
          onTreeLoaded={setTree}
          onPageCreated={onPageCreated}
          onSubpageCreated={async () => {
            await refreshTree()
            setTreeVersion((v) => v + 1)
            onPageCreated()
          }}
          autoRenameId={autoRenameId}
          onAutoRenameDone={() => setAutoRenameId(null)}
          onFocusNewPage={focusNewPage}
        />
      )}
    </div>
  )
}
