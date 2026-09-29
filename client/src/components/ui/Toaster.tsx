import { create } from 'zustand'

/**
 * App-wide toasts for feedback that has no natural inline home — mostly
 * failures that used to be swallowed silently (import/export, rename, move…).
 * Call `toast.error('…')` / `toast.success('…')` from anywhere; <Toaster/> is
 * mounted once in __root.tsx.
 */

type ToastKind = 'error' | 'success'

interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

interface ToastState {
  toasts: ToastItem[]
  push: (kind: ToastKind, message: string) => void
  dismiss: (id: number) => void
}

const DISMISS_MS = 4000
let nextId = 1

const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (kind, message) => {
    const id = nextId++
    // Cap the stack so a burst of failures can't fill the screen.
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, message }] }))
    setTimeout(() => get().dismiss(id), DISMISS_MS)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export const toast = {
  error: (message: string) => useToastStore.getState().push('error', message),
  success: (message: string) => useToastStore.getState().push('success', message),
}

export default function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  return (
    // Always mounted so screen readers pick up additions to the live region.
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 left-4 sm:left-auto z-[70] flex flex-col items-end gap-2 pointer-events-none"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto w-full sm:w-80 flex items-start gap-2 px-3 py-2.5 rounded-md border shadow-xl text-sm bg-gray-800 ${
            t.kind === 'error' ? 'border-red-800 text-red-300' : 'border-green-800 text-green-400'
          }`}
        >
          <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d={t.kind === 'error' ? 'M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z' : 'M5 13l4 4L19 7'}
            />
          </svg>
          <span className="flex-1 min-w-0 text-gray-100">{t.message}</span>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss"
            className="flex-shrink-0 p-0.5 rounded text-gray-400 hover:text-gray-100 hover:bg-gray-700"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}
