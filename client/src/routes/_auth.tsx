import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { getMe } from '../api'
import AppShell from '../components/AppShell'

export const Route = createFileRoute('/_auth')({
  beforeLoad: async () => {
    try {
      await getMe()
    } catch {
      throw redirect({ to: '/login' })
    }
  },
  component: AuthLayout,
})

function AuthLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}
