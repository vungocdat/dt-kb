import { create } from 'zustand'

type Mode = 'edit' | 'read'
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'
type Theme = 'dark' | 'light'

const THEME_KEY = 'kb:theme'

function readStoredTheme(): Theme {
  if (typeof localStorage === 'undefined') return 'dark'
  return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'
}

/** Sync the <html> class and highlight.js stylesheet to the active theme. */
export function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.remove('dark', 'light')
  root.classList.add(theme)
  const link = document.getElementById('hljs-theme') as HTMLLinkElement | null
  if (link) {
    link.href = `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-${theme === 'light' ? 'light' : 'dark'}.min.css`
  }
}

interface UIState {
  sidebarOpen: boolean
  currentMode: Mode
  searchOpen: boolean
  searchQuery: string
  saveStatus: SaveStatus
  theme: Theme
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  setMode: (mode: Mode) => void
  toggleMode: () => void
  openSearch: () => void
  closeSearch: () => void
  openSearchWithQuery: (q: string) => void
  setSearchQuery: (q: string) => void
  setSaveStatus: (status: SaveStatus) => void
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  currentMode: 'read',
  searchOpen: false,
  searchQuery: '',
  saveStatus: 'idle',
  theme: readStoredTheme(),
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
  setTheme: (theme) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(THEME_KEY, theme)
    applyTheme(theme)
    set({ theme })
  },
  toggleTheme: () =>
    set((s) => {
      const theme: Theme = s.theme === 'dark' ? 'light' : 'dark'
      if (typeof localStorage !== 'undefined') localStorage.setItem(THEME_KEY, theme)
      applyTheme(theme)
      return { theme }
    }),
}))
