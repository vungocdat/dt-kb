import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface MenuItem {
  label: string
  /** SVG path `d` for a 24×24 stroke icon (same style as the rest of the app). */
  icon?: string
  danger?: boolean
  onSelect: () => void
}

interface MenuProps {
  /** Accessible name for the trigger button. */
  label: string
  items: MenuItem[]
  /** Which edge of the trigger the popover lines up with. */
  align?: 'left' | 'right'
  triggerClassName?: string
  /** Trigger content; defaults to a horizontal "⋯" icon. */
  children?: ReactNode
}

const MENU_WIDTH = 192 // w-48

/**
 * Small dropdown menu. The popover is portalled to <body> with position:fixed
 * so the sidebar's overflow never clips it. Closes on outside click, Escape,
 * Tab or selection; ↑/↓ move between items.
 *
 * React events still bubble through portals to the trigger's ancestors, so
 * clicks inside the popover are stopped here — otherwise a menu inside a
 * clickable row (e.g. a space header) would also toggle that row.
 */
export default function Menu({ label, items, align = 'left', triggerClassName = '', children }: MenuProps) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const open = pos !== null

  const close = (refocus = true) => {
    setPos(null)
    if (refocus) triggerRef.current?.focus()
  }

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (open) return close()
    const rect = e.currentTarget.getBoundingClientRect()
    const left = align === 'right' ? rect.right - MENU_WIDTH : rect.left
    setPos({
      top: rect.bottom + 4,
      left: Math.max(4, Math.min(left, window.innerWidth - MENU_WIDTH - 4)),
    })
  }

  // Move focus into the menu once it has rendered.
  useLayoutEffect(() => {
    if (open) popoverRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      close(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
      return
    }
    if (e.key === 'Tab') {
      close(false)
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const buttons = [...(popoverRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])]
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next = e.key === 'ArrowDown' ? (i + 1) % buttons.length : (i - 1 + buttons.length) % buttons.length
    buttons[next]?.focus()
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className={triggerClassName}
      >
        {children ?? (
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
        )}
      </button>

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            role="menu"
            aria-label={label}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="fixed z-50 w-48 py-1 bg-gray-800 border border-gray-700 rounded-md shadow-xl"
            style={{ top: pos.top, left: pos.left }}
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  close()
                  item.onSelect()
                }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left focus:outline-none transition-colors ${
                  item.danger
                    ? 'text-red-400 hover:bg-red-900/30 focus:bg-red-900/30'
                    : 'text-gray-200 hover:bg-gray-700 hover:text-gray-50 focus:bg-gray-700 focus:text-gray-50'
                }`}
              >
                {item.icon && (
                  <svg className="w-4 h-4 flex-shrink-0 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                  </svg>
                )}
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}
