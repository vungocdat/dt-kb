import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getPage, deletePage, type Page } from '../../../api'
import { useUIStore } from '../../../store'
import MarkdownEditor from '../../../components/editor/MarkdownEditor'
import { MarkdownRenderer } from '../../../components/editor/MarkdownRenderer'
import { Skeleton } from '../../../components/ui/Skeleton'

export const Route = createFileRoute('/_auth/pages/$pageId')({
  component: PageView,
})

function PageView() {
  const { pageId } = Route.useParams()
  const navigate = useNavigate()
  const currentMode = useUIStore((s) => s.currentMode)
  const setMode = useUIStore((s) => s.setMode)

  const [page, setPage] = useState<Page | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Shared scroll fraction between read and edit modes — updated by whichever is active.
  const scrollFractionRef = useRef(0)
  const readDivRef = useRef<HTMLDivElement>(null)

  // When switching back to read mode, restore the scroll position the editor was at.
  useEffect(() => {
    if (currentMode !== 'read') return
    const fraction = scrollFractionRef.current
    if (fraction < 0.01) return
    requestAnimationFrame(() => {
      const el = readDivRef.current
      if (!el) return
      const max = el.scrollHeight - el.clientHeight
      el.scrollTop = fraction * max
    })
  }, [currentMode])

  // Keep a stable ref to page for the delete handler
  const pageRef = useRef<Page | null>(null)
  pageRef.current = page

  const handleDelete = useCallback(async () => {
    const current = pageRef.current
    if (!current) return
    if (!confirm(`Delete "${current.title}"? Its children will be moved up.`)) return
    try {
      await deletePage(current.id)
      window.dispatchEvent(
        new CustomEvent('kb:page-deleted', { detail: { spaceId: current.spaceId } })
      )
      await navigate({ to: '/' })
    } catch {
      alert('Failed to delete page.')
    }
  }, [navigate])

  const handleTitleChange = useCallback((newTitle: string) => {
    setPage((p) => (p ? { ...p, title: newTitle } : p))
  }, [])

  // Publish page context to AppShell/TopBar via custom event
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('kb:page', {
        detail: { page, onDelete: handleDelete, onTitleChange: handleTitleChange },
      }),
    )
  }, [page, handleDelete, handleTitleChange])

  // Clear page context on unmount
  useEffect(() => {
    return () => {
      window.dispatchEvent(
        new CustomEvent('kb:page', { detail: { page: null } }),
      )
    }
  }, [])

  // Load page data
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setMode('read')

    const load = async () => {
      try {
        const p = await getPage(pageId)
        if (!cancelled) {
          setPage(p)
          document.title = `${p.title} — dt-kb`
        }
      } catch {
        if (!cancelled) setError('Page not found or failed to load.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
      document.title = 'dt-kb'
    }
  }, [pageId, setMode])

  if (loading) {
    return (
      <div className="px-8 py-8 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-7 w-64 mb-6" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    )
  }

  if (error || !page) {
    return (
      <div className="px-8 py-8">
        <p className="text-red-400">{error ?? 'Page not found.'}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {currentMode === 'edit' ? (
        <MarkdownEditor
          key={page.id}
          pageId={page.id}
          initialContent={page.content}
          initialScrollFraction={scrollFractionRef.current}
          scrollFractionRef={scrollFractionRef}
          onPageUpdate={(updated) =>
            setPage((prev) => (prev ? { ...updated, content: prev.content } : updated))
          }
        />
      ) : (
        <div
          ref={readDivRef}
          className="flex-1 overflow-y-auto"
          onScroll={(e) => {
            const el = e.currentTarget
            const max = el.scrollHeight - el.clientHeight
            scrollFractionRef.current = max > 0 ? el.scrollTop / max : 0
          }}
        >
          <MarkdownRenderer html={page.contentHtml} />
        </div>
      )}
    </div>
  )
}
