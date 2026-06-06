import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { getSpaces, getSpaceTree, type Space, type PageTreeNode } from '../../api'
import SpaceCard from '../../components/dashboard/SpaceCard'
import SpaceContents from '../../components/dashboard/SpaceContents'
import { Skeleton } from '../../components/ui/Skeleton'

export const Route = createFileRoute('/_auth/')({
  component: Dashboard,
})

function flattenTree(nodes: PageTreeNode[]): PageTreeNode[] {
  const result: PageTreeNode[] = []
  function walk(list: PageTreeNode[]) {
    for (const n of list) {
      result.push(n)
      if (n.children.length > 0) walk(n.children)
    }
  }
  walk(nodes)
  return result
}

function Dashboard() {
  const [spaces, setSpaces] = useState<Space[]>([])
  const [trees, setTrees] = useState<Record<string, PageTreeNode[]>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const s = await getSpaces()
        if (cancelled) return
        setSpaces(s)
        const treeEntries = await Promise.all(
          s.map(async (sp) => [sp.id, flattenTree(await getSpaceTree(sp.id))] as const),
        )
        if (!cancelled) {
          setTrees(Object.fromEntries(treeEntries))
        }
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

      {/* Contents */}
      <section>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
          Contents
        </h2>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-lg" />
            ))}
          </div>
        ) : (
          <SpaceContents spaces={spaces} trees={trees} />
        )}
      </section>
    </div>
  )
}
