import { type ReactNode, useEffect, useState } from 'react'
import { useUIStore } from '../store'
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
  const [pageCtx, setPageCtx] = useState<PageContext>({ page: null })
  const [sidebarRefresh, setSidebarRefresh] = useState(0)

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
      {/* Sidebar */}
      <div
        className={`flex-shrink-0 transition-all duration-200 ${
          sidebarOpen ? 'w-64' : 'w-12'
        } bg-gray-900 border-r border-gray-800 flex flex-col h-full overflow-hidden`}
      >
        <Sidebar
          collapsed={!sidebarOpen}
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
