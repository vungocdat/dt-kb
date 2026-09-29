import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { getSpaces, getRecentPages, type Space, type RecentPage } from '../../api'
import SpaceCard from '../../components/dashboard/SpaceCard'
import RecentPages from '../../components/dashboard/RecentPages'
import { Skeleton } from '../../components/ui/Skeleton'
import { ICON_PLUS, ICON_UPLOAD } from '../../components/ui/icons'
import PageLayout from '../../components/layout/PageLayout'

export const Route = createFileRoute('/_auth/kb')({
  component: Dashboard,
})

function Dashboard() {
  const [spaces, setSpaces] = useState<Space[]>([])
  const [recent, setRecent] = useState<RecentPage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([getSpaces(), getRecentPages()])
      setSpaces(s)
      setRecent(r)
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    // The sidebar announces space create/import/rename/delete so the cards
    // stay in step without a manual refresh.
    // A page deleted from the tree changes counts and "recently edited" too.
    const onChange = () => void load()
    window.addEventListener('kb:spaces-changed', onChange)
    window.addEventListener('kb:page-deleted', onChange)
    return () => {
      window.removeEventListener('kb:spaces-changed', onChange)
      window.removeEventListener('kb:page-deleted', onChange)
    }
  }, [load])

  return (
    <PageLayout title="Knowledge base">
      {error && (
        <div className="mb-6 flex items-center gap-3 text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-md px-3 py-2">
          <span className="flex-1">Could not load the knowledge base.</span>
          <button
            onClick={() => void load()}
            className="px-2 py-0.5 rounded text-gray-200 bg-gray-700 hover:bg-gray-600"
          >
            Retry
          </button>
        </div>
      )}

      {/* Spaces */}
      <section className="mb-10">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
          Spaces
        </h2>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-lg" />
            ))}
          </div>
        ) : spaces.length === 0 && !error ? (
          <div className="border border-dashed border-gray-700 rounded-lg px-6 py-10 text-center">
            <p className="text-sm text-gray-300">No spaces yet.</p>
            <p className="mt-1 text-sm text-gray-500">
              A space groups related pages — e.g. “DevOps” or “Homelab”.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {/* The sidebar owns the create/import UI; these just open it. */}
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('kb:new-space'))}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-gray-50 hover:bg-blue-500 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ICON_PLUS} />
                </svg>
                New space
              </button>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('kb:import-space'))}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-gray-700 text-gray-200 hover:bg-gray-600 hover:text-gray-50 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ICON_UPLOAD} />
                </svg>
                Import from ZIP
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {spaces.map((space) => (
              <SpaceCard key={space.id} space={space} />
            ))}
          </div>
        )}
      </section>

      {/* Recently edited — only once there's somewhere to write */}
      {(loading || spaces.length > 0) && (
        <section>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
            Recently edited
          </h2>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-11 rounded-md" />
              ))}
            </div>
          ) : (
            <RecentPages pages={recent} />
          )}
        </section>
      )}
    </PageLayout>
  )
}
