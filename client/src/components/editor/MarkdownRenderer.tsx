import { useEffect, useRef } from 'react'
import { parseHeadings } from './tocUtils'

interface MarkdownRendererProps {
  html: string
}

export function MarkdownRenderer({ html }: MarkdownRendererProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = ref.current
    if (!container) return

    // Stamp IDs onto headings so TOC anchor links work
    const tocHeadings = parseHeadings(container.innerHTML)
    const headingEls = container.querySelectorAll('h1,h2,h3,h4,h5,h6')
    headingEls.forEach((el, i) => {
      if (tocHeadings[i]) el.id = tocHeadings[i].id
    })

    container.querySelectorAll('pre').forEach((pre) => {
      if (pre.querySelector('.kb-copy-btn')) return

      // Styling and hover/focus visibility live in index.css (.kb-copy-btn)
      const btn = document.createElement('button')
      btn.className = 'kb-copy-btn'
      btn.textContent = 'Copy'
      btn.setAttribute('aria-label', 'Copy code to clipboard')
      pre.appendChild(btn)

      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        const text = pre.querySelector('code')?.textContent ?? pre.textContent ?? ''
        try {
          await navigator.clipboard.writeText(text)
          btn.textContent = 'Copied!'
          btn.dataset.state = 'copied'
        } catch {
          btn.textContent = 'Failed'
          btn.dataset.state = 'failed'
        }
        setTimeout(() => {
          btn.textContent = 'Copy'
          delete btn.dataset.state
        }, 2000)
      })
    })
  }, [html])

  return (
    <div
      ref={ref}
      // max-w-3xl keeps prose lines at a readable ~75 characters on wide screens
      className="prose prose-invert max-w-3xl mx-auto px-8 py-6"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
