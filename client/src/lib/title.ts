import { useEffect } from 'react'

export const APP_NAME = 'DT workspace'

/**
 * Sets the browser tab title to "<title> — DT workspace" while the calling
 * component is mounted, and back to the bare app name when it unmounts.
 * A null/empty title shows just the app name (e.g. while a page is loading).
 */
export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    document.title = title ? `${title} — ${APP_NAME}` : APP_NAME
    return () => {
      document.title = APP_NAME
    }
  }, [title])
}
