import { useEffect, useRef } from 'react'
import { create } from 'zustand'

/**
 * The one confirmation UI for destructive actions (delete page / space /
 * note / task, clear completed). Promise-based so callers read like the old
 * `window.confirm`:
 *
 *   if (!(await confirmDialog({ title: 'Delete page?', confirmLabel: 'Delete' }))) return
 *
 * <ConfirmHost/> is mounted once in __root.tsx. The confirm button is focused
 * first so Enter confirms; Escape or a backdrop click cancels.
 */

interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
}

interface ConfirmState {
  request: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null
}

const useConfirmStore = create<ConfirmState>(() => ({ request: null }))

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    // A second request while one is open cancels the first.
    useConfirmStore.getState().request?.resolve(false)
    useConfirmStore.setState({ request: { ...options, resolve } })
  })
}

export default function ConfirmHost() {
  const request = useConfirmStore((s) => s.request)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  // Focus goes back to whatever opened the dialog.
  const returnFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!request) return
    returnFocus.current = document.activeElement as HTMLElement | null
    confirmRef.current?.focus()
  }, [request])

  if (!request) return null

  const settle = (ok: boolean) => {
    request.resolve(ok)
    useConfirmStore.setState({ request: null })
    // The opener may have been removed by the action itself (e.g. a deleted row).
    if (returnFocus.current?.isConnected) returnFocus.current.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Escape') {
      e.preventDefault()
      settle(false)
    }
    // An Enter still held from opening the dialog must not confirm it.
    if (e.key === 'Enter' && e.repeat) e.preventDefault()
    // Two buttons: keep Tab cycling between them.
    if (e.key === 'Tab') {
      e.preventDefault()
      const next = document.activeElement === cancelRef.current ? confirmRef.current : cancelRef.current
      next?.focus()
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/60" onClick={() => settle(false)} aria-hidden="true" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="kb-confirm-title"
        aria-describedby={request.message ? 'kb-confirm-message' : undefined}
        onKeyDown={handleKeyDown}
        className="fixed z-[60] left-1/2 top-[20vh] -translate-x-1/2 w-[calc(100%-2rem)] max-w-sm bg-gray-800 border border-gray-700 rounded-lg shadow-2xl p-5"
      >
        <h2 id="kb-confirm-title" className="text-base font-semibold text-gray-100">
          {request.title}
        </h2>
        {request.message && (
          <p id="kb-confirm-message" className="mt-1.5 text-sm text-gray-400">
            {request.message}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => settle(false)}
            className="px-3 py-1.5 text-sm rounded-md bg-gray-700 text-gray-200 hover:bg-gray-600 hover:text-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => settle(true)}
            className="px-3 py-1.5 text-sm font-medium rounded-md bg-red-700 text-gray-50 hover:bg-red-600 transition-colors"
          >
            {request.confirmLabel ?? 'Delete'}
          </button>
        </div>
      </div>
    </>
  )
}
