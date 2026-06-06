import { createRootRoute, Outlet } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useUIStore } from '../store'
import SearchModal from '../components/search/SearchModal'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  const toggleMode = useUIStore((s) => s.toggleMode)
  const openSearch = useUIStore((s) => s.openSearch)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault()
        toggleMode()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        openSearch()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggleMode, openSearch])

  return (
    <>
      <Outlet />
      <SearchModal />
    </>
  )
}
