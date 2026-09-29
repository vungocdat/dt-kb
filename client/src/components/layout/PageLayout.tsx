import type { ReactNode } from 'react'
import { useDocumentTitle } from '../../lib/title'

interface PageLayoutProps {
  /** Page heading; also becomes the browser tab title. */
  title: string
  /** Quiet text beside the heading, e.g. "3 open". */
  meta?: ReactNode
  children: ReactNode
}

/**
 * Shared frame for the app's list/form screens (Knowledge base, To-do,
 * Settings): its own scroll area, one centred column width and one heading
 * style, so the title doesn't jump when switching tabs. Content that
 * shouldn't stretch to the full column (e.g. settings forms) narrows itself
 * inside. The calendar and page views have their own layouts.
 */
export default function PageLayout({ title, meta, children }: PageLayoutProps) {
  useDocumentTitle(title)

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-8 py-8">
      <div className="max-w-4xl mx-auto w-full">
        <header className="flex items-baseline gap-3 mb-6">
          <h1 className="text-2xl font-bold text-gray-100">{title}</h1>
          {meta && <span className="text-sm text-gray-500">{meta}</span>}
        </header>
        {children}
      </div>
    </div>
  )
}
