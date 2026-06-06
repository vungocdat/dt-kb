import { useEffect, useRef } from 'react'

interface MarkdownRendererProps {
  html: string
}

export function MarkdownRenderer({ html }: MarkdownRendererProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = ref.current
    if (!container) return

    container.querySelectorAll('pre').forEach((pre) => {
      if (pre.querySelector('.kb-copy-btn')) return

      pre.style.position = 'relative'

      const btn = document.createElement('button')
      btn.className = 'kb-copy-btn'
      btn.textContent = 'Copy'
      btn.setAttribute('aria-label', 'Copy code to clipboard')
      btn.style.cssText = [
        'position:absolute',
        'top:8px',
        'right:8px',
        'padding:2px 10px',
        'font-size:11px',
        'font-family:inherit',
        'background:rgba(55,65,81,0.9)',
        'color:#9ca3af',
        'border:1px solid rgba(75,85,99,0.6)',
        'border-radius:4px',
        'cursor:pointer',
        'opacity:0',
        'transition:opacity 0.15s,color 0.15s',
        'z-index:10',
      ].join(';')

      pre.appendChild(btn)

      const show = () => { btn.style.opacity = '1' }
      const hide = () => { btn.style.opacity = '0' }
      pre.addEventListener('mouseenter', show)
      pre.addEventListener('mouseleave', hide)

      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        const text = pre.querySelector('code')?.textContent ?? pre.textContent ?? ''
        try {
          await navigator.clipboard.writeText(text)
          btn.textContent = 'Copied!'
          btn.style.color = '#86efac'
        } catch {
          btn.textContent = 'Failed'
          btn.style.color = '#fca5a5'
        }
        setTimeout(() => {
          btn.textContent = 'Copy'
          btn.style.color = '#9ca3af'
        }, 2000)
      })
    })
  }, [html])

  return (
    <div
      ref={ref}
      className="prose prose-invert max-w-none px-8 py-6"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
