import { useEffect, useRef, useState } from 'react'

const EMOJI = [
  '📁', '📂', '🗂️', '📚', '📖', '📝', '📒', '📦',
  '💻', '🖥️', '⌨️', '🐧', '🐳', '☁️', '🌐', '📡',
  '🛠️', '🔧', '⚙️', '🧰', '🔌', '🗄️', '💾', '🧱',
  '🔐', '🔑', '🛡️', '🐛', '🤖', '🧪', '🔍', '📊',
  '🚀', '🔥', '⚡', '💡', '🎯', '📈', '🧠', '🎓',
  '🏠', '⭐', '✅', '❤️', '🎵', '🎮', '🍕', '🌱',
]

interface EmojiPickerProps {
  /** Viewport coordinates of the trigger element (from getBoundingClientRect). */
  anchor: { left: number; bottom: number }
  onSelect: (emoji: string) => void
  onClose: () => void
}

/**
 * Lightweight emoji picker popover. Rendered with position:fixed so it
 * escapes the sidebar's overflow-y-auto clipping. Closes on outside click
 * or Escape.
 */
export default function EmojiPicker({ anchor, onSelect, onClose }: EmojiPickerProps) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const [custom, setCustom] = useState('')

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) onClose()
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  const commitCustom = () => {
    const value = custom.trim()
    if (!value || value.length > 16) return
    onSelect(value)
  }

  // Keep the popover inside the viewport: width is w-64 (256px), height ~290px.
  const left = Math.min(anchor.left, window.innerWidth - 264)
  const top = Math.min(anchor.bottom + 4, window.innerHeight - 300)

  return (
    <div
      ref={popoverRef}
      className="fixed z-50 w-64 bg-gray-900 border border-gray-700 rounded-lg shadow-xl p-2"
      style={{ left, top }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="grid grid-cols-8 gap-0.5">
        {EMOJI.map((emoji) => (
          <button
            key={emoji}
            onClick={() => onSelect(emoji)}
            className="w-7 h-7 flex items-center justify-center text-base rounded hover:bg-gray-700 transition-colors"
          >
            {emoji}
          </button>
        ))}
      </div>
      <div className="mt-2 pt-2 border-t border-gray-800">
        <input
          type="text"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commitCustom() }}
          placeholder="Or paste any emoji + Enter"
          maxLength={16}
          className="w-full px-2 py-1 text-xs bg-gray-800 border border-gray-600 rounded text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
    </div>
  )
}
