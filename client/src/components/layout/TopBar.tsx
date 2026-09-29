import { useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useUIStore } from '../../store'
import { updatePage, type Page } from '../../api'
import Menu from '../ui/Menu'
import { ICON_DOWNLOAD, ICON_TRASH } from '../ui/icons'
import { shortcut } from '../../lib/platform'

interface TopBarProps {
  page: Page | null
  onDelete?: () => void
  onTitleChange?: (title: string) => void
}

const SAVE_STATUS_LABELS: Record<string, string> = {
  idle: '',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Save failed',
}

export default function TopBar({ page, onDelete, onTitleChange }: TopBarProps) {
  const currentMode = useUIStore((s) => s.currentMode)
  const toggleMode = useUIStore((s) => s.toggleMode)
  const openSearch = useUIStore((s) => s.openSearch)
  const saveStatus = useUIStore((s) => s.saveStatus)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)

  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)

  const handleExportPage = () => {
    if (!page) return
    const blob = new Blob([page.content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${page.title || 'untitled'}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const startEditingTitle = () => {
    if (!page) return
    setTitleValue(page.title)
    setEditingTitle(true)
    setTimeout(() => titleInputRef.current?.select(), 0)
  }

  const commitTitle = async () => {
    if (!page) return
    setEditingTitle(false)
    const trimmed = titleValue.trim() || 'Untitled'
    if (trimmed === page.title) return
    try {
      await updatePage(page.id, { title: trimmed })
      onTitleChange?.(trimmed)
    } catch {
      // revert
      onTitleChange?.(page.title)
    }
  }

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') void commitTitle()
    if (e.key === 'Escape') {
      setEditingTitle(false)
      setTitleValue(page?.title ?? '')
    }
  }

  const saveStatusLabel = SAVE_STATUS_LABELS[saveStatus] ?? ''

  return (
    <div className="h-12 flex-shrink-0 bg-gray-900 border-b border-gray-800 flex items-center px-4 gap-3">
      {/* Left column: sidebar toggle + breadcrumb */}
      <div className="flex-1 flex items-center gap-2 min-w-0">
        {/* Sidebar toggle (mobile / quick access) */}
        <button
          onClick={toggleSidebar}
          aria-label="Toggle sidebar"
          className="p-1 rounded text-gray-400 hover:text-gray-100 hover:bg-gray-700 transition-colors flex-shrink-0 md:hidden"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 min-w-0 text-sm">
          {page ? (
            <>
              <Link to="/kb" className="text-gray-400 hover:text-gray-200 transition-colors flex-shrink-0 max-w-[8rem] truncate" title={page.spaceName}>
                {page.spaceName}
              </Link>
              {page.ancestors.map((a) => (
                <span key={a.id} className="contents">
                  <span className="text-gray-600 flex-shrink-0">/</span>
                  <Link
                    to="/pages/$pageId"
                    params={{ pageId: a.id }}
                    className="text-gray-400 hover:text-gray-200 transition-colors truncate max-w-[8rem] flex-shrink"
                    title={a.title}
                  >
                    {a.title}
                  </Link>
                </span>
              ))}
              <span className="text-gray-600 flex-shrink-0">/</span>
              {editingTitle ? (
                <input
                  ref={titleInputRef}
                  type="text"
                  value={titleValue}
                  onChange={(e) => setTitleValue(e.target.value)}
                  onBlur={() => void commitTitle()}
                  onKeyDown={handleTitleKeyDown}
                  className="flex-1 min-w-0 bg-gray-800 border border-gray-600 rounded px-2 py-0.5 text-gray-100 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              ) : (
                <span
                  className="text-gray-200 truncate cursor-pointer hover:text-gray-100"
                  onClick={startEditingTitle}
                  title="Click to rename"
                >
                  {page.title || 'Untitled'}
                </span>
              )}
            </>
          ) : (
            <span className="text-gray-400">DT workspace</span>
          )}
        </div>
      </div>

      {/* Center column: search trigger (opens the Cmd/Ctrl+K modal) */}
      <button
        type="button"
        onClick={openSearch}
        aria-label="Search"
        className="flex-shrink-0 flex items-center gap-2 h-8 w-9 sm:w-56 px-2.5 text-sm bg-gray-800 border border-gray-700 rounded-md text-gray-500 hover:border-gray-600 hover:text-gray-300 transition-colors"
      >
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className="hidden sm:inline flex-1 text-left">Search…</span>
        <kbd className="hidden sm:inline text-[11px] font-sans text-gray-400 bg-gray-700 px-1.5 py-0.5 rounded">
          {shortcut('K')}
        </kbd>
      </button>

      {/* Right column: save status + edit/read toggle + page actions */}
      <div className="flex-1 flex items-center justify-end gap-2">
        {/* Save status */}
        {saveStatus !== 'idle' && (
          <span
            className={`text-xs ${
              saveStatus === 'error'
                ? 'text-red-400'
                : saveStatus === 'saved'
                ? 'text-green-400'
                : 'text-gray-400'
            }`}
          >
            {saveStatusLabel}
          </span>
        )}

        {page && (
          <>
            {/* Edit/Read toggle */}
            <button
              onClick={toggleMode}
              title={`Switch to ${currentMode === 'read' ? 'edit' : 'read'} mode (${shortcut('E')})`}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                currentMode === 'edit'
                  ? 'bg-blue-600 text-gray-50 hover:bg-blue-500'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-gray-100'
              }`}
            >
              {currentMode === 'edit' ? 'Read' : 'Edit'}
            </button>

            {/* Less frequent / destructive actions stay behind a menu */}
            <Menu
              label="Page actions"
              align="right"
              triggerClassName="p-1.5 rounded text-gray-400 hover:text-gray-100 hover:bg-gray-700 transition-colors"
              items={[
                { label: 'Export as .md', icon: ICON_DOWNLOAD, onSelect: handleExportPage },
                ...(onDelete
                  ? [{ label: 'Delete page…', icon: ICON_TRASH, danger: true, onSelect: onDelete }]
                  : []),
              ]}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                <circle cx="5" cy="12" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="19" cy="12" r="2" />
              </svg>
            </Menu>
          </>
        )}
      </div>
    </div>
  )
}
