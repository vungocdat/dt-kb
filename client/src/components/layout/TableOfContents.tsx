import { useEffect, useRef, useState } from 'react'
import { parseHeadings, type TocHeading } from '../editor/tocUtils'

interface TableOfContentsProps {
  html: string
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
}

export function TableOfContents({ html, scrollContainerRef }: TableOfContentsProps) {
  const headings: TocHeading[] = parseHeadings(html)
  const [activeId, setActiveId] = useState<string>('')
  const observerRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    if (headings.length < 2) return

    // Clean up any previous observer
    observerRef.current?.disconnect()

    const root = scrollContainerRef.current
    if (!root) return

    const visibleHeadings = new Map<string, number>()

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const id = (entry.target as HTMLElement).id
          if (entry.isIntersecting) {
            visibleHeadings.set(id, entry.boundingClientRect.top)
          } else {
            visibleHeadings.delete(id)
          }
        })

        if (visibleHeadings.size > 0) {
          // Pick the topmost visible heading
          const topmost = [...visibleHeadings.entries()].sort((a, b) => a[1] - b[1])[0]
          setActiveId(topmost[0])
        }
      },
      {
        root,
        rootMargin: '0px 0px -70% 0px',
      },
    )

    const observer = observerRef.current
    headings.forEach(({ id }) => {
      const el = root.querySelector(`#${CSS.escape(id)}`)
      if (el) observer.observe(el)
    })

    return () => {
      observer.disconnect()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, scrollContainerRef.current])

  if (headings.length < 2) return null

  const minLevel = Math.min(...headings.map((h) => h.level))

  return (
    <aside className="hidden xl:block w-56 flex-shrink-0 sticky top-0 self-start h-screen overflow-y-auto py-6 pl-2 pr-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
        On this page
      </p>
      <nav>
        {headings.map((h) => (
          <a
            key={`${h.id}-${h.level}`}
            href={`#${h.id}`}
            onClick={(e) => {
              e.preventDefault()
              const scrollRoot = scrollContainerRef.current
              const target = scrollRoot?.querySelector(`#${CSS.escape(h.id)}`) as HTMLElement | null
              if (target && scrollRoot) {
                const scrollTop = scrollRoot.scrollTop + target.getBoundingClientRect().top - scrollRoot.getBoundingClientRect().top
                scrollRoot.scrollTo({ top: scrollTop, behavior: 'smooth' })
              }
            }}
            style={{ paddingLeft: `${(h.level - minLevel) * 12}px` }}
            className={`block text-sm py-0.5 truncate transition-colors ${
              activeId === h.id
                ? 'text-blue-400'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {h.text}
          </a>
        ))}
      </nav>
    </aside>
  )
}
