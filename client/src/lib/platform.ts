/** True on macOS / iOS, where shortcuts use ⌘ rather than Ctrl. */
export const isMac =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)

/** Label for a Cmd/Ctrl shortcut, e.g. shortcut('K') → "⌘K" or "Ctrl+K". */
export const shortcut = (key: string) => (isMac ? `⌘${key}` : `Ctrl+${key}`)
