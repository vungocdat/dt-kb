// ── Types ─────────────────────────────────────────────────────────────────────

export interface Space {
  id: string
  name: string
  description: string
  icon: string
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export interface Page {
  id: string
  spaceId: string
  parentId: string | null
  title: string
  content: string
  contentHtml: string
  sortOrder: number
  updatedAt: number
}

export interface PageTreeNode {
  id: string
  title: string
  parentId: string | null
  sortOrder: number
  depth: number
  children: PageTreeNode[]
}

export interface RecentPage {
  id: string
  title: string
  spaceId: string
  spaceName: string
  updatedAt: number
}

export interface SearchResult {
  id: string
  title: string
  spaceId: string
  snippet: string
}

// ── Base fetch ────────────────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    credentials: 'include',
    ...options,
  })

  if (res.status === 401) {
    window.location.href = '/login'
    // Return a never-resolving promise — the page is navigating away
    return new Promise(() => {})
  }

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`API ${res.status}: ${text}`)
  }

  // 204 No Content
  if (res.status === 204) return undefined as T

  return res.json() as Promise<T>
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function login(username: string, password: string): Promise<void> {
  await apiFetch<void>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export async function logout(): Promise<void> {
  await apiFetch<void>('/api/auth/logout', { method: 'POST' })
}

// getMe uses a raw fetch — must NOT trigger the 401→/login redirect because
// it's called in beforeLoad on the login page itself to check auth state.
export async function getMe(): Promise<{ username: string }> {
  const res = await fetch('/api/auth/me', { credentials: 'include' })
  if (!res.ok) throw new Error('Unauthorized')
  return res.json()
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return apiFetch<void>('/api/auth/password', {
    method: 'PATCH',
    body: JSON.stringify({ currentPassword, newPassword }),
  })
}

// ── Spaces ────────────────────────────────────────────────────────────────────

export async function getSpaces(): Promise<Space[]> {
  return apiFetch<Space[]>('/api/spaces')
}

export async function createSpace(
  data: Pick<Space, 'name' | 'description' | 'icon'>,
): Promise<Space> {
  return apiFetch<Space>('/api/spaces', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateSpace(
  id: string,
  data: Partial<Pick<Space, 'name' | 'description' | 'icon' | 'sortOrder'>>,
): Promise<Space> {
  return apiFetch<Space>(`/api/spaces/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function deleteSpace(id: string): Promise<void> {
  return apiFetch<void>(`/api/spaces/${id}`, { method: 'DELETE' })
}

export async function getSpaceTree(id: string): Promise<PageTreeNode[]> {
  return apiFetch<PageTreeNode[]>(`/api/spaces/${id}/tree`)
}

// ── Pages ─────────────────────────────────────────────────────────────────────

export async function getRecentPages(): Promise<RecentPage[]> {
  return apiFetch<RecentPage[]>('/api/pages/recent')
}

export async function getPage(id: string): Promise<Page> {
  return apiFetch<Page>(`/api/pages/${id}`)
}

export async function createPage(
  data: Pick<Page, 'spaceId' | 'title'> & { parentId?: string | null; content?: string },
): Promise<Page> {
  return apiFetch<Page>('/api/pages', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updatePage(
  id: string,
  data: Partial<Pick<Page, 'title' | 'content'>>,
): Promise<Page> {
  return apiFetch<Page>(`/api/pages/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function deletePage(id: string): Promise<void> {
  return apiFetch<void>(`/api/pages/${id}`, { method: 'DELETE' })
}

export async function movePage(
  id: string,
  data: { parentId: string | null; sortOrder?: number; spaceId?: string },
): Promise<Page> {
  return apiFetch<Page>(`/api/pages/${id}/move`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

// ── Search ────────────────────────────────────────────────────────────────────

export async function search(
  q: string,
  spaceId?: string,
): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q })
  if (spaceId) params.set('spaceId', spaceId)
  return apiFetch<SearchResult[]>(`/api/search?${params.toString()}`)
}

// ── Export / Import ───────────────────────────────────────────────────────────

export async function exportSpace(id: string): Promise<Blob> {
  const res = await fetch(`/api/spaces/${id}/export`, { credentials: 'include' })
  if (!res.ok) throw new Error('Export failed')
  return res.blob()
}

export async function importSpace(file: File): Promise<Space> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/spaces/import', {
    method: 'POST',
    credentials: 'include',
    body: form,
  })
  if (!res.ok) throw new Error('Import failed')
  return res.json() as Promise<Space>
}
