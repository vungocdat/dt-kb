import { create } from 'zustand'

type Mode = 'edit' | 'read'
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface UIState {
  sidebarOpen: boolean
  currentMode: Mode
  searchOpen: boolean
  searchQuery: string
  saveStatus: SaveStatus
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  setMode: (mode: Mode) => void
  toggleMode: () => void
  openSearch: () => void
  closeSearch: () => void
  openSearchWithQuery: (q: string) => void
  setSearchQuery: (q: string) => void
  setSaveStatus: (status: SaveStatus) => void
}

/** Below Tailwind's `md` breakpoint the sidebar is an overlay drawer (AppShell). */
export const MOBILE_QUERY = '(max-width: 767px)'

export const useUIStore = create<UIState>((set) => ({
  // Start closed on phones so the drawer doesn't flash open on load.
  sidebarOpen: typeof window === 'undefined' || !window.matchMedia(MOBILE_QUERY).matches,
  currentMode: 'read',
  searchOpen: false,
  searchQuery: '',
  saveStatus: 'idle',
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setMode: (mode) => set({ currentMode: mode }),
  toggleMode: () =>
    set((s) => ({ currentMode: s.currentMode === 'read' ? 'edit' : 'read' })),
  openSearch: () => set({ searchOpen: true }),
  closeSearch: () => set({ searchOpen: false, searchQuery: '' }),
  openSearchWithQuery: (q) => set({ searchOpen: true, searchQuery: q }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setSaveStatus: (status) => set({ saveStatus: status }),
}))
