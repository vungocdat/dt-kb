import { useNavigate } from '@tanstack/react-router'
import { getSpaceTree, type Space } from '../../api'

interface SpaceCardProps {
  space: Space
}

export default function SpaceCard({ space }: SpaceCardProps) {
  const navigate = useNavigate()

  const handleClick = async () => {
    try {
      const tree = await getSpaceTree(space.id)
      // Navigate to first page in the tree (breadth-first, sorted by sortOrder)
      const first = tree.find((n) => n.parentId === null) ?? tree[0]
      if (first) {
        await navigate({ to: '/pages/$pageId', params: { pageId: first.id } })
      } else {
        // No pages yet — navigate to dashboard (already there) and show hint
        // A more complete UX would show an inline empty state, but for now
        // just scroll to the sidebar where they can create one.
      }
    } catch {
      // ignore — API error
    }
  }

  return (
    <button
      onClick={() => void handleClick()}
      className="w-full text-left bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-600 rounded-lg p-4 transition-colors group"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl flex-shrink-0" role="img" aria-label={space.name}>
          {space.icon || '📁'}
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-100 group-hover:text-white truncate">
            {space.name}
          </h3>
          {space.description && (
            <p className="mt-0.5 text-xs text-gray-400 line-clamp-2">
              {space.description}
            </p>
          )}
        </div>
      </div>
    </button>
  )
}
