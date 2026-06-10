import { useRef, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useUIStore } from '../../store'
import { logout, updatePage, type Page } from '../../api'

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
  const searchOpen = useUIStore((s) => s.searchOpen)
  const searchQuery = useUIStore((s) => s.searchQuery)
  const openSearchWithQuery = useUIStore((s) => s.openSearchWithQuery)
  const saveStatus = useUIStore((s) => s.saveStatus)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)

  const navigate = useNavigate()

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

  const handleLogout = async () => {
    try {
      await logout()
    } finally {
      await navigate({ to: '/login' })
    }
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
              <Link to="/" className="text-gray-400 hover:text-gray-200 transition-colors flex-shrink-0 max-w-[8rem] truncate" title={page.spaceName}>
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
            <span className="text-gray-400">dt-kb</span>
          )}
        </div>
      </div>

      {/* Center column: search input */}
      <div className="flex-shrink-0 w-56">
        <input
          type="text"
          value={searchQuery}
          placeholder="Search… ⌘K"
          onChange={(e) => openSearchWithQuery(e.target.value)}
          onFocus={() => { if (!searchOpen) openSearch() }}
          readOnly={searchOpen}
          className="w-full px-3 py-1 text-sm bg-gray-800 border border-gray-700 rounded-md text-gray-300 placeholder-gray-500 focus:outline-none focus:border-gray-500 cursor-text"
          aria-label="Search"
        />
      </div>

      {/* Right column: save status + edit/read toggle + delete */}
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

        {/* Edit/Read toggle */}
        {page && (
          <button
            onClick={toggleMode}
            title={`Switch to ${currentMode === 'read' ? 'edit' : 'read'} mode (Ctrl+E)`}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              currentMode === 'edit'
                ? 'bg-blue-600 text-white hover:bg-blue-500'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-gray-100'
            }`}
          >
            {currentMode === 'edit' ? 'Read' : 'Edit'}
          </button>
        )}

        {/* Delete page */}
        {page && onDelete && (
          <button
            onClick={onDelete}
            aria-label="Delete page"
            title="Delete page"
            className="p-1.5 rounded text-gray-400 hover:text-red-400 hover:bg-red-900/20 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}

        {/* Export page as markdown */}
        {page && (
          <button
            onClick={handleExportPage}
            aria-label="Export page as markdown"
            title="Export page as .md"
            className="p-1.5 rounded text-gray-400 hover:text-gray-100 hover:bg-gray-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
        )}

        {/* Settings */}
        <button
          onClick={() => void navigate({ to: '/settings' })}
          aria-label="Settings"
          title="Settings"
          className="p-1.5 rounded text-gray-400 hover:text-gray-100 hover:bg-gray-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        {/* Logout */}
        <button
          onClick={() => void handleLogout()}
          aria-label="Log out"
          title="Log out"
          className="p-1.5 rounded text-gray-400 hover:text-gray-100 hover:bg-gray-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </div>
    </div>
  )
}
