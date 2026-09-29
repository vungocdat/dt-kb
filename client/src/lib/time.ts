/** `timestamp` is a Unix epoch in *seconds* — the API's updated_at unit. */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp * 1000
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

  const seconds = Math.round(diff / 1000)
  const minutes = Math.round(diff / 60_000)
  const hours = Math.round(diff / 3_600_000)
  const days = Math.round(diff / 86_400_000)
  const weeks = Math.round(diff / 604_800_000)
  const months = Math.round(diff / 2_592_000_000)

  if (seconds < 60) return rtf.format(-seconds, 'second')
  if (minutes < 60) return rtf.format(-minutes, 'minute')
  if (hours < 24) return rtf.format(-hours, 'hour')
  if (days < 7) return rtf.format(-days, 'day')
  if (weeks < 5) return rtf.format(-weeks, 'week')
  return rtf.format(-months, 'month')
}
