import { createFileRoute, redirect } from '@tanstack/react-router'
import { loadDefaultTab } from '../../lib/tabs'

/**
 * `/` is the app's landing: it sends you to the default tab the user picked in
 * Settings (Calendar until they choose). Doing it here, rather than changing
 * every `to: '/'`, keeps login, the sidebar title and "Home" links pointing at
 * whatever the default currently is.
 */
export const Route = createFileRoute('/_auth/')({
  beforeLoad: () => {
    throw redirect({ to: loadDefaultTab().to, replace: true })
  },
})
