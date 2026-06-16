import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { getSpaces, getRecentPages, type Space, type RecentPage } from '../../api'
import SpaceCard from '../../components/dashboard/SpaceCard'
import RecentPages from '../../components/dashboard/RecentPages'
import { Skeleton } from '../../components/ui/Skeleton'

export const Route = createFileRoute('/_auth/')({
  component: Dashboard,
})

function Dashboard() {
  const [spaces, setSpaces] = useState<Space[]>([])
  const [recent, setRecent] = useState<RecentPage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [s, r] = await Promise.all([getSpaces(), getRecentPages()])
        if (cancelled) return
        setSpaces(s)
        setRecent(r)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="flex-1 overflow-y-auto px-8 py-8 max-w-5xl mx-auto w-full">
      <h1 className="text-2xl font-bold text-gray-100 mb-6">Dashboard</h1>

      {/* Spaces */}
      <section className="mb-10">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
          Spaces
        </h2>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        ) : spaces.length === 0 ? (
          <p className="text-gray-500 text-sm">
            No spaces yet. Create one in the sidebar.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {spaces.map((space) => (
              <SpaceCard key={space.id} space={space} />
            ))}
          </div>
        )}
      </section>

      {/* Recently edited */}
      <section>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
          Recently Edited
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
    </div>
  )
}
