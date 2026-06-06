import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import type { Space, PageTreeNode } from '../../api'

interface SpaceContentsProps {
  spaces: Space[]
  trees: Record<string, PageTreeNode[]>
}

function DocIcon() {
  return (
    <svg
      className="w-3.5 h-3.5 text-gray-500 flex-shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  )
}

interface SpaceSectionProps {
  space: Space
  nodes: PageTreeNode[]
}

function SpaceSection({ space, nodes }: SpaceSectionProps) {
  const [expanded, setExpanded] = useState(true)

  const rootNodes = nodes
    .filter((n) => n.parentId === null)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  return (
    <div>
      {/* Space header row */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 py-2 px-3 rounded-md hover:bg-gray-800 cursor-pointer select-none transition-colors"
        aria-expanded={expanded}
      >
        <span className="text-base leading-none" aria-hidden="true">
          {space.icon}
        </span>
        <span className="flex-1 text-left text-sm font-semibold text-gray-200 truncate">
          {space.name}
        </span>
        <svg
          className={`w-3.5 h-3.5 text-gray-500 flex-shrink-0 transition-transform duration-150 ${
            expanded ? 'rotate-90' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      </button>

      {/* Page tree */}
      {expanded && (
        <div>
          {rootNodes.length === 0 ? (
            <p className="text-gray-600 text-xs px-3 pb-2">No pages yet</p>
          ) : (
            <ul>
              {rootNodes.map((node) => (
                <PageRow key={node.id} node={node} nodes={nodes} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

interface PageRowProps {
  node: PageTreeNode
  nodes: PageTreeNode[]
}

function PageRow({ node, nodes }: PageRowProps) {
  const children = nodes
    .filter((n) => n.parentId === node.id)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  // Base 8px + 16px per depth level
  const paddingLeft = 8 + node.depth * 16

  return (
    <li>
      <Link
        to="/pages/$pageId"
        params={{ pageId: node.id }}
        style={{ paddingLeft: `${paddingLeft}px` }}
        className="flex items-center gap-1.5 pr-2 py-1 text-sm text-gray-300 hover:text-gray-100 hover:bg-gray-800 rounded-sm truncate"
      >
        <DocIcon />
        <span className="truncate">{node.title || 'Untitled'}</span>
      </Link>
      {children.length > 0 && (
        <ul>
          {children.map((child) => (
            <PageRow key={child.id} node={child} nodes={nodes} />
          ))}
        </ul>
      )}
    </li>
  )
}

export default function SpaceContents({ spaces, trees }: SpaceContentsProps) {
  if (spaces.length === 0) {
    return (
      <p className="text-gray-500 text-sm">
        No spaces yet. Create one in the sidebar.
      </p>
    )
  }

  const sorted = [...spaces].sort((a, b) => a.sortOrder - b.sortOrder)

  return (
    <div className="space-y-1">
      {sorted.map((space) => (
        <SpaceSection
          key={space.id}
          space={space}
          nodes={trees[space.id] ?? []}
        />
      ))}
    </div>
  )
}
