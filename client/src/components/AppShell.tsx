import { type ReactNode, useEffect, useState } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { MOBILE_QUERY, useUIStore } from '../store'
import { useMediaQuery } from '../lib/useMediaQuery'
import Sidebar from './layout/Sidebar'
import TopBar from './layout/TopBar'
import type { Page } from '../api'

interface PageContext {
  page: Page | null
  onDelete?: () => void
  onTitleChange?: (title: string) => void
}

interface AppShellProps {
  children: ReactNode
}

export default function AppShell({ children }: AppShellProps) {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen)
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen)
  const [pageCtx, setPageCtx] = useState<PageContext>({ page: null })
  const [sidebarRefresh, setSidebarRefresh] = useState(0)

  // Below `md` the sidebar is an overlay drawer instead of a column, so the
  // content keeps the full width of a phone screen.
  const isMobile = useMediaQuery(MOBILE_QUERY)
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const drawerOpen = isMobile && sidebarOpen

  // Crossing the breakpoint resets the sidebar to that layout's default:
  // closed drawer on phones, full column on desktop.
  useEffect(() => {
    setSidebarOpen(!isMobile)
  }, [isMobile, setSidebarOpen])

  // Picking a page/tab in the drawer closes it.
  useEffect(() => {
    if (isMobile) setSidebarOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // Escape closes the drawer.
  useEffect(() => {
    if (!drawerOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [drawerOpen, setSidebarOpen])

  // Listen for page context events from the page route component
  useEffect(() => {
    const handler = (e: CustomEvent<PageContext>) => {
      setPageCtx(e.detail)
    }
    window.addEventListener('kb:page', handler as EventListener)
    return () => window.removeEventListener('kb:page', handler as EventListener)
  }, [])

  const handlePageCreated = () => {
    setSidebarRefresh((n) => n + 1)
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950 text-gray-100">
      {/* Drawer backdrop (phones only) */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar: a column on desktop (w-64 open / w-12 rail), a slide-in drawer on phones */}
      <div
        // A closed drawer is off-screen; inert keeps it out of the tab order too.
        inert={isMobile && !sidebarOpen}
        className={`bg-gray-900 border-r border-gray-800 flex flex-col h-full overflow-hidden ${
          isMobile
            ? `fixed inset-y-0 left-0 z-40 w-64 transition-transform duration-200 ${
                sidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
              }`
            : `flex-shrink-0 transition-all duration-200 ${sidebarOpen ? 'w-64' : 'w-12'}`
        }`}
      >
        <Sidebar
          collapsed={!isMobile && !sidebarOpen}
          refreshKey={sidebarRefresh}
          onPageCreated={handlePageCreated}
        />
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar
          page={pageCtx.page}
          onDelete={pageCtx.onDelete}
          onTitleChange={pageCtx.onTitleChange}
        />
        <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  )
}
