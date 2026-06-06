import { Link } from '@tanstack/react-router'
import type { RecentPage } from '../../api'

interface RecentPagesProps {
  pages: RecentPage[]
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

  const seconds = Math.round(diff / 1000)
  const minutes = Math.round(diff / 60_000)
  const hours = Math.round(diff / 3_600_000)
  const days = Math.round(diff / 86_400_000)
  const weeks = Math.round(diff / 604_800_000)
  const months = Math.round(diff / 2_592_000_000)

  if (seconds < 60) return rtf.format(-seconds, 'second')
  if (minutes < 60) return rtf.format(-minutes, 'minute')
  if (hours < 24) return rtf.format(-hours, 'hour')
  if (days < 7) return rtf.format(-days, 'day')
  if (weeks < 5) return rtf.format(-weeks, 'week')
  return rtf.format(-months, 'month')
}

export default function RecentPages({ pages }: RecentPagesProps) {
  if (pages.length === 0) {
    return (
      <p className="text-gray-500 text-sm">No pages yet. Create one in the sidebar.</p>
    )
  }

  return (
    <ul className="space-y-1">
      {pages.map((page) => (
        <li key={page.id}>
          <Link
            to="/pages/$pageId"
            params={{ pageId: page.id }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-gray-800 transition-colors group"
          >
            <svg
              className="w-4 h-4 text-gray-500 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <span className="flex-1 text-sm text-gray-200 group-hover:text-gray-100 truncate">
              {page.title || 'Untitled'}
            </span>
            <span className="flex-shrink-0 text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full truncate max-w-[120px]">
              {page.spaceName}
            </span>
            <span className="flex-shrink-0 text-xs text-gray-500">
              {formatRelativeTime(page.updatedAt)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
