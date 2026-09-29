import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { createPage, getSpaceTree, type Space } from '../../api'
import { formatRelativeTime } from '../../lib/time'
import { toast } from '../ui/Toaster'

interface SpaceCardProps {
  space: Space
}

export default function SpaceCard({ space }: SpaceCardProps) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const pageCount = space.pageCount ?? 0
  const isEmpty = pageCount === 0

  // Opens the space's first root page — or, for an empty space, creates that
  // first page so the card is never a dead click.
  const handleClick = async () => {
    if (busy) return
    setBusy(true)
    try {
      const tree = await getSpaceTree(space.id)
      const first = tree
        .filter((n) => n.parentId === null)
        .sort((a, b) => a.sortOrder - b.sortOrder)[0]
      if (first) {
        await navigate({ to: '/pages/$pageId', params: { pageId: first.id } })
        return
      }
      const page = await createPage({ spaceId: space.id, title: 'Untitled', parentId: null })
      // Same event the sidebar uses for "this space's tree changed" — refreshes it.
      window.dispatchEvent(new CustomEvent('kb:page-deleted', { detail: { spaceId: space.id } }))
      await navigate({ to: '/pages/$pageId', params: { pageId: page.id } })
    } catch {
      toast.error(`Could not open "${space.name}".`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={() => void handleClick()}
      disabled={busy}
      className="w-full h-full text-left bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-600 rounded-lg p-4 transition-colors group flex flex-col disabled:opacity-70 disabled:cursor-wait"
    >
      <div className="flex items-start gap-3 flex-1">
        <span className="text-2xl flex-shrink-0" aria-hidden>
          {space.icon || '📁'}
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-100 group-hover:text-gray-50 truncate">
            {space.name}
          </h3>
          {space.description && (
            <p className="mt-0.5 text-xs text-gray-400 line-clamp-2">
              {space.description}
            </p>
          )}
        </div>
      </div>
      <p className="mt-3 text-xs text-gray-500">
        {isEmpty ? (
          <span className="text-blue-400 group-hover:text-blue-300">+ Write the first page</span>
        ) : (
          <>
            {pageCount} {pageCount === 1 ? 'page' : 'pages'}
            {space.lastEditedAt != null && <> · edited {formatRelativeTime(space.lastEditedAt)}</>}
          </>
        )}
      </p>
    </button>
  )
}
