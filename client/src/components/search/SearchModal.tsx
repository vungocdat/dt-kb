import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useUIStore } from '../../store'
import { getRecentPages, getSpaces, search, type RecentPage, type SearchResult, type Space } from '../../api'

const SEARCH_DEBOUNCE_MS = 300

/** One row in the list — a search hit, or a recent page while the box is empty. */
interface Item {
  id: string
  title: string
  spaceId: string
  snippet?: string
}

export default function SearchModal() {
  const searchOpen = useUIStore((s) => s.searchOpen)
  const closeSearch = useUIStore((s) => s.closeSearch)
  const searchQuery = useUIStore((s) => s.searchQuery)
  const navigate = useNavigate()

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [recent, setRecent] = useState<RecentPage[]>([])
  const [spaces, setSpaces] = useState<Map<string, Space>>(new Map())
  const [loading, setLoading] = useState(false)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  // Focus input when opened; pre-fill from store query when provided
  useEffect(() => {
    if (searchOpen) {
      setQuery(searchQuery)
      setResults([])
      setActiveIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [searchOpen]) // searchQuery intentionally omitted — only runs on open

  // Space names for the result chips, and recent pages for the empty state.
  // Refetched on every open so they never go stale; both are small.
  useEffect(() => {
    if (!searchOpen) return
    let cancelled = false
    void Promise.all([getSpaces(), getRecentPages()])
      .then(([s, r]) => {
        if (cancelled) return
        setSpaces(new Map(s.map((sp) => [sp.id, sp])))
        setRecent(r)
      })
      .catch(() => {
        // Non-essential: results still work, just without chips / recents.
      })
    return () => {
      cancelled = true
    }
  }, [searchOpen])

  // Debounced search
  useEffect(() => {
    if (!searchOpen) return
    if (!query.trim()) {
      setResults([])
      setLoading(false)
      setActiveIndex(0)
      return
    }

    setLoading(true)
    if (debounceTimer.current !== null) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(async () => {
      try {
        const data = await search(query.trim())
        setResults(data)
        setActiveIndex(0)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      if (debounceTimer.current !== null) clearTimeout(debounceTimer.current)
    }
  }, [query, searchOpen])

  const showingRecent = !query.trim()
  const items: Item[] = showingRecent ? recent : results

  // Keep the keyboard-selected row visible in the scrolling list.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const handleClose = () => {
    closeSearch()
    setQuery('')
    setResults([])
  }

  const handleSelect = async (item: Item) => {
    handleClose()
    await navigate({ to: '/pages/$pageId', params: { pageId: item.id } })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      handleClose()
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, items.length - 1))
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    }
    if (e.key === 'Enter' && items[activeIndex]) {
      e.preventDefault()
      void handleSelect(items[activeIndex])
    }
  }

  if (!searchOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="fixed inset-x-0 top-[15vh] mx-auto z-50 w-full max-w-lg px-4"
        onKeyDown={handleKeyDown}
      >
        <div className="bg-gray-800 rounded-xl shadow-2xl border border-gray-700 overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-700">
            <svg
              className="w-4 h-4 text-gray-400 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search pages…"
              aria-label="Search pages"
              className="flex-1 bg-transparent text-gray-100 placeholder-gray-500 text-sm focus:outline-none"
            />
            {loading && (
              <svg
                className="w-4 h-4 text-gray-400 animate-spin flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            )}
            <kbd className="flex-shrink-0 text-xs text-gray-500 bg-gray-700 px-1.5 py-0.5 rounded font-mono">
              Esc
            </kbd>
          </div>

          {/* Results, or recent pages while nothing is typed */}
          {items.length > 0 && (
            <>
              {showingRecent && (
                <p className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Recently edited
                </p>
              )}
              <ul ref={listRef} className={`max-h-80 overflow-y-auto ${showingRecent ? 'pb-2' : 'py-2'}`}>
                {items.map((item, index) => {
                  const space = spaces.get(item.spaceId)
                  return (
                    <li key={item.id}>
                      <button
                        data-index={index}
                        onClick={() => void handleSelect(item)}
                        onMouseMove={() => setActiveIndex(index)}
                        className={`w-full text-left px-4 py-2.5 transition-colors ${
                          index === activeIndex ? 'bg-blue-600/20 text-blue-300' : 'text-gray-200'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="flex-1 min-w-0 text-sm font-medium truncate">
                            {item.title || 'Untitled'}
                          </span>
                          {space && (
                            <span className="flex-shrink-0 max-w-[40%] truncate text-xs text-gray-400 bg-gray-700 px-2 py-0.5 rounded-full">
                              {space.icon || '📁'} {space.name}
                            </span>
                          )}
                        </div>
                        {item.snippet && (
                          <div
                            className="mt-0.5 text-xs text-gray-400 line-clamp-2 [&_mark]:bg-yellow-400/30 [&_mark]:text-yellow-200 [&_mark]:rounded [&_mark]:px-0.5"
                            // Snippet contains <mark>…</mark> from FTS5 highlight — safe server HTML
                            dangerouslySetInnerHTML={{ __html: item.snippet }}
                          />
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}

          {/* Empty state */}
          {!loading && query.trim() && results.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-gray-500">
              No results for &ldquo;{query}&rdquo;
            </div>
          )}

          {/* Footer hint */}
          <div className="px-4 py-2 border-t border-gray-700 flex items-center gap-4 text-xs text-gray-500">
            <span><kbd className="bg-gray-700 px-1 rounded font-mono">↑↓</kbd> navigate</span>
            <span><kbd className="bg-gray-700 px-1 rounded font-mono">↵</kbd> open</span>
            <span><kbd className="bg-gray-700 px-1 rounded font-mono">Esc</kbd> close</span>
          </div>
        </div>
      </div>
    </>
  )
}
