import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getJournalMonth,
  openJournalDay,
  type JournalMonth,
  type RecentPage,
} from '../../api'
import { Skeleton } from '../../components/ui/Skeleton'

export const Route = createFileRoute('/_auth/calendar')({
  component: Calendar,
})

// ── Local-date helpers ────────────────────────────────────────────────────────
// Everything here works in the browser's local timezone on purpose: a day note
// is keyed by the date the user believes it is, not by UTC. Dates are only ever
// constructed from (y, m, d) triples so no parsing/offset surprises creep in.

const pad = (n: number) => String(n).padStart(2, '0')

const toISO = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

const addDays = (d: Date, n: number) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/**
 * The 42 cells (6 fixed rows, so the grid never reflows between months) starting
 * on the Monday of the week containing the 1st.
 */
function buildGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  const mondayOffset = (first.getDay() + 6) % 7
  const start = addDays(first, -mondayOffset)
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

function formatMonthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month, 1))
}

function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(y, m - 1, d))
}

function formatTime(epochSeconds: number): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(epochSeconds * 1000))
}

function Calendar() {
  const navigate = useNavigate()
  const today = useMemo(() => new Date(), [])
  const todayISO = toISO(today)

  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() })
  const [selected, setSelected] = useState(todayISO)
  const [data, setData] = useState<JournalMonth | null>(null)
  const [loading, setLoading] = useState(true)
  const [opening, setOpening] = useState(false)

  const cells = useMemo(() => buildGrid(view.year, view.month), [view])
  const cellRefs = useRef(new Map<string, HTMLButtonElement>())
  // Set when arrow-key nav crosses a month boundary: the destination button
  // doesn't exist until the new view renders, so focus is handed over below.
  const focusAfterRender = useRef<string | null>(null)

  useEffect(() => {
    if (!focusAfterRender.current) return
    cellRefs.current.get(focusAfterRender.current)?.focus()
    focusAfterRender.current = null
  }, [cells])

  // One request per view: day notes for the visible range plus every page edited
  // in it. The epoch bounds are derived from the local cells, endTs exclusive.
  useEffect(() => {
    const from = toISO(cells[0])
    const to = toISO(cells[41])
    const startTs = Math.floor(cells[0].getTime() / 1000)
    const endTs = Math.floor(addDays(cells[41], 1).getTime() / 1000)

    let cancelled = false
    setLoading(true)
    const load = async () => {
      try {
        const month = await getJournalMonth(from, to, startTs, endTs)
        if (!cancelled) setData(month)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [cells])

  const notesByDate = useMemo(() => {
    const map = new Map<string, string>()
    for (const day of data?.days ?? []) map.set(day.date, day.pageId)
    return map
  }, [data])

  // Activity arrives with raw epochs so it can be bucketed by *local* date here.
  const activityByDate = useMemo(() => {
    const map = new Map<string, RecentPage[]>()
    for (const page of data?.activity ?? []) {
      const key = toISO(new Date(page.updatedAt * 1000))
      const bucket = map.get(key)
      if (bucket) bucket.push(page)
      else map.set(key, [page])
    }
    return map
  }, [data])

  const goToMonth = (year: number, month: number) => {
    const normalized = new Date(year, month, 1)
    setView({ year: normalized.getFullYear(), month: normalized.getMonth() })
    // Land on today when stepping into the current month, otherwise the 1st —
    // keeping a selection that has scrolled out of view would be confusing.
    setSelected(
      normalized.getFullYear() === today.getFullYear() &&
        normalized.getMonth() === today.getMonth()
        ? todayISO
        : toISO(normalized),
    )
  }

  const goToToday = () => {
    setView({ year: today.getFullYear(), month: today.getMonth() })
    setSelected(todayISO)
  }

  const selectDate = (date: Date) => {
    const iso = toISO(date)
    setSelected(iso)
    // Stepping outside the current month follows the selection into that month.
    if (date.getMonth() !== view.month || date.getFullYear() !== view.year) {
      setView({ year: date.getFullYear(), month: date.getMonth() })
    }
  }

  const openDay = useCallback(
    async (iso: string) => {
      const existing = notesByDate.get(iso)
      if (existing) {
        await navigate({ to: '/pages/$pageId', params: { pageId: existing } })
        return
      }

      setOpening(true)
      try {
        const ref = await openJournalDay(iso)
        // A brand-new journal space has to appear in the sidebar's space list;
        // a new day note has to appear in that space's tree.
        if (ref.spaceCreated) window.dispatchEvent(new CustomEvent('kb:sidebar-refresh'))
        window.dispatchEvent(
          new CustomEvent('kb:tree-refresh', { detail: { spaceId: ref.spaceId } }),
        )
        await navigate({ to: '/pages/$pageId', params: { pageId: ref.pageId } })
      } catch {
        setOpening(false)
      }
    },
    [navigate, notesByDate],
  )

  // Arrow keys walk the grid, Enter/Space opens — handled on the wrapper so the
  // focused cell stays in sync with the selection.
  const handleGridKeyDown = (e: React.KeyboardEvent) => {
    const deltas: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    }
    const delta = deltas[e.key]
    if (delta === undefined) return
    e.preventDefault()

    const [y, m, d] = selected.split('-').map(Number)
    const next = new Date(y, m - 1, d + delta)
    selectDate(next)

    const nextISO = toISO(next)
    const el = cellRefs.current.get(nextISO)
    if (el) el.focus()
    else focusAfterRender.current = nextISO
  }

  const selectedNoteId = notesByDate.get(selected)
  const selectedActivity = activityByDate.get(selected) ?? []

  return (
    <div className="flex-1 overflow-y-auto px-8 py-8 max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-100">
          {formatMonthLabel(view.year, view.month)}
        </h1>
        <div className="flex-1" />
        <button
          onClick={() => goToMonth(view.year, view.month - 1)}
          aria-label="Previous month"
          className="p-1.5 rounded text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={goToToday}
          className="px-3 py-1 text-xs font-medium rounded bg-gray-700 text-gray-200 hover:bg-gray-600 hover:text-gray-100 transition-colors"
        >
          Today
        </button>
        <button
          onClick={() => goToMonth(view.year, view.month + 1)}
          aria-label="Next month"
          className="p-1.5 rounded text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Month grid */}
        <div className="flex-1 min-w-0 w-full">
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map((label) => (
              <div
                key={label}
                className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider py-1"
              >
                {label}
              </div>
            ))}
          </div>

          {loading && !data ? (
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 42 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-md" />
              ))}
            </div>
          ) : (
            <div onKeyDown={handleGridKeyDown} className="grid grid-cols-7 gap-1">
              {cells.map((cell) => {
                const iso = toISO(cell)
                const inMonth = cell.getMonth() === view.month
                const isToday = iso === todayISO
                const isSelected = iso === selected
                const hasNote = notesByDate.has(iso)
                const edits = activityByDate.get(iso)?.length ?? 0

                return (
                  <button
                    key={iso}
                    ref={(el) => {
                      if (el) cellRefs.current.set(iso, el)
                      else cellRefs.current.delete(iso)
                    }}
                    onClick={() => selectDate(cell)}
                    onDoubleClick={() => void openDay(iso)}
                    aria-label={formatLongDate(iso)}
                    aria-current={isToday ? 'date' : undefined}
                    aria-pressed={isSelected}
                    className={`h-20 flex flex-col items-start gap-1 p-1.5 rounded-md border text-left transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                      isSelected
                        ? 'border-gray-500 bg-gray-800'
                        : isToday
                        ? 'border-blue-500/50 bg-blue-500/5 hover:bg-gray-800'
                        : 'border-gray-800 hover:bg-gray-800'
                    }`}
                  >
                    <span
                      className={`text-xs leading-5 w-5 h-5 flex items-center justify-center rounded-full flex-shrink-0 ${
                        isToday
                          ? 'bg-blue-600 text-white font-semibold'
                          : inMonth
                          ? 'text-gray-300'
                          : 'text-gray-600'
                      }`}
                    >
                      {cell.getDate()}
                    </span>

                    <span className="flex-1" />

                    {hasNote && (
                      <span className="flex items-center gap-1 text-[11px] text-blue-300 truncate max-w-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                        Note
                      </span>
                    )}
                    {edits > 0 && (
                      <span className="text-[11px] text-gray-500 truncate max-w-full">
                        {edits} edited
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Selected-day detail */}
        <aside className="w-full lg:w-80 flex-shrink-0 bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-gray-200">{formatLongDate(selected)}</h2>
          {selected === todayISO && (
            <p className="text-xs text-blue-400 mt-0.5">Today</p>
          )}

          <button
            onClick={() => void openDay(selected)}
            disabled={opening}
            className="mt-4 w-full px-3 py-1.5 text-sm font-medium rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {selectedNoteId ? 'Open note' : opening ? 'Creating…' : 'Create note'}
          </button>

          <p className="mt-2 text-xs text-gray-500">
            {data?.spaceName
              ? `Day notes live in the “${data.spaceName}” space.`
              : 'The first note creates a “Journal” space for your day notes.'}
          </p>

          <h3 className="mt-6 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Edited this day
          </h3>
          {selectedActivity.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">Nothing edited.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {selectedActivity.map((page) => (
                <li key={page.id}>
                  <button
                    onClick={() =>
                      void navigate({ to: '/pages/$pageId', params: { pageId: page.id } })
                    }
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-gray-800 transition-colors group"
                  >
                    <span className="flex-1 text-sm text-gray-300 group-hover:text-gray-100 truncate">
                      {page.title || 'Untitled'}
                    </span>
                    <span className="flex-shrink-0 text-xs text-gray-500">
                      {formatTime(page.updatedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  )
}
