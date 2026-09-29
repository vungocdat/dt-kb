import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { changePassword, changeUsername } from '../../api'
import { loadDefaultTab, loadTabOrder, saveDefaultTab, TABS, type TabId } from '../../lib/tabs'
import { useDocumentTitle } from '../../lib/title'

export const Route = createFileRoute('/_auth/settings')({
  component: SettingsPage,
})

function SettingsPage() {
  useDocumentTitle('Settings')
  return (
    <div className="min-h-full bg-gray-950 px-4 py-8">
      <div className="max-w-md mx-auto mt-16">
        {/* Back link */}
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200 transition-colors mb-6"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Home
        </Link>

        {/* Page heading */}
        <h1 className="text-xl font-semibold text-gray-100 mb-8">Settings</h1>

        <div className="space-y-6">
          <DefaultPageCard />
          <ChangeUsernameCard />
          <ChangePasswordCard />
        </div>
      </div>
    </div>
  )
}

/** Which tab `/` opens — login, the sidebar title and "Home" all land there. */
function DefaultPageCard() {
  const [selected, setSelected] = useState<TabId>(() => loadDefaultTab().id)
  // List tabs in the user's sidebar order so the choices look familiar.
  const tabs = loadTabOrder().map((id) => TABS.find((t) => t.id === id)!)

  const choose = (id: TabId) => {
    setSelected(id)
    saveDefaultTab(id)
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
      <h2 className="text-sm font-medium text-gray-300 uppercase tracking-wide mb-2">
        Default page
      </h2>
      <p id="defaultPageHint" className="text-sm text-gray-500 mb-4">
        The tab the app opens on after you sign in. Saved in this browser.
      </p>

      <fieldset aria-describedby="defaultPageHint" className="space-y-1.5">
        <legend className="sr-only">Default page</legend>
        {tabs.map((tab) => {
          const checked = tab.id === selected
          return (
            <label
              key={tab.id}
              className={`flex items-center gap-3 px-3 py-2 rounded-md border text-sm cursor-pointer transition-colors has-[:focus-visible]:ring-1 has-[:focus-visible]:ring-blue-500 ${
                checked
                  ? 'border-blue-500/60 bg-blue-500/10 text-gray-100'
                  : 'border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-gray-100'
              }`}
            >
              <input
                type="radio"
                name="defaultPage"
                value={tab.id}
                checked={checked}
                onChange={() => choose(tab.id)}
                className="accent-blue-500"
              />
              <svg className="w-4 h-4 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
              </svg>
              {tab.label}
            </label>
          )
        })}
      </fieldset>
    </div>
  )
}

function ChangeUsernameCard() {
  const { username: initialUsername } = Route.useRouteContext()
  const [newUsername, setNewUsername] = useState(initialUsername)
  const [currentPassword, setCurrentPassword] = useState('')

  const [fieldError, setFieldError] = useState<string | undefined>()
  const [apiError, setApiError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setApiError(null)
    setSuccess(false)

    const trimmed = newUsername.trim()
    if (!trimmed) {
      setFieldError('Username cannot be empty.')
      return
    }
    setFieldError(undefined)

    setSaving(true)
    try {
      const { username } = await changeUsername(currentPassword, trimmed)
      setNewUsername(username)
      setCurrentPassword('')
      setSuccess(true)
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'An unexpected error occurred.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
      <h2 className="text-sm font-medium text-gray-300 uppercase tracking-wide mb-5">
        Change Username
      </h2>

      <form onSubmit={(e) => void handleSubmit(e)} noValidate className="space-y-4">
        {/* New username */}
        <div>
          <label htmlFor="newUsername" className="block text-sm text-gray-400 mb-1">
            Username
          </label>
          <input
            id="newUsername"
            type="text"
            autoComplete="username"
            required
            value={newUsername}
            onChange={(e) => {
              setNewUsername(e.target.value)
              if (fieldError) setFieldError(undefined)
            }}
            className={`w-full px-3 py-2 bg-gray-800 border rounded-md text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:ring-1 transition-colors ${
              fieldError
                ? 'border-red-500 focus:ring-red-500'
                : 'border-gray-700 focus:ring-blue-500 focus:border-blue-500'
            }`}
          />
          {fieldError && <p className="mt-1 text-xs text-red-400">{fieldError}</p>}
        </div>

        {/* Current password (authorises the change) */}
        <div>
          <label htmlFor="usernameCurrentPassword" className="block text-sm text-gray-400 mb-1">
            Current password
          </label>
          <input
            id="usernameCurrentPassword"
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
          />
        </div>

        {/* API error */}
        {apiError && (
          <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-md px-3 py-2">
            {apiError}
          </p>
        )}

        {/* Success */}
        {success && (
          <p className="text-sm text-green-400 bg-green-900/20 border border-green-800 rounded-md px-3 py-2">
            Username updated. Use it the next time you sign in.
          </p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={saving}
          className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-gray-50 text-sm font-medium rounded-md transition-colors"
        >
          {saving ? 'Saving…' : 'Update username'}
        </button>
      </form>
    </div>
  )
}

function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [fieldErrors, setFieldErrors] = useState<{
    newPassword?: string
    confirmPassword?: string
  }>({})
  const [apiError, setApiError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [saving, setSaving] = useState(false)

  const validate = (): boolean => {
    const errors: typeof fieldErrors = {}
    if (newPassword.length < 8) {
      errors.newPassword = 'New password must be at least 8 characters.'
    }
    if (newPassword !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match.'
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setApiError(null)
    setSuccess(false)

    if (!validate()) return

    setSaving(true)
    try {
      await changePassword(currentPassword, newPassword)
      setSuccess(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setFieldErrors({})
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'An unexpected error occurred.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
      <h2 className="text-sm font-medium text-gray-300 uppercase tracking-wide mb-5">
        Change Password
      </h2>

      <form onSubmit={(e) => void handleSubmit(e)} noValidate className="space-y-4">
            {/* Current password */}
            <div>
              <label htmlFor="currentPassword" className="block text-sm text-gray-400 mb-1">
                Current password
              </label>
              <input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              />
            </div>

            {/* New password */}
            <div>
              <label htmlFor="newPassword" className="block text-sm text-gray-400 mb-1">
                New password
              </label>
              <input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                required
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value)
                  if (fieldErrors.newPassword) setFieldErrors((prev) => ({ ...prev, newPassword: undefined }))
                }}
                className={`w-full px-3 py-2 bg-gray-800 border rounded-md text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:ring-1 transition-colors ${
                  fieldErrors.newPassword
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-gray-700 focus:ring-blue-500 focus:border-blue-500'
                }`}
              />
              {fieldErrors.newPassword && (
                <p className="mt-1 text-xs text-red-400">{fieldErrors.newPassword}</p>
              )}
            </div>

            {/* Confirm new password */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm text-gray-400 mb-1">
                Confirm new password
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value)
                  if (fieldErrors.confirmPassword) setFieldErrors((prev) => ({ ...prev, confirmPassword: undefined }))
                }}
                className={`w-full px-3 py-2 bg-gray-800 border rounded-md text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:ring-1 transition-colors ${
                  fieldErrors.confirmPassword
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-gray-700 focus:ring-blue-500 focus:border-blue-500'
                }`}
              />
              {fieldErrors.confirmPassword && (
                <p className="mt-1 text-xs text-red-400">{fieldErrors.confirmPassword}</p>
              )}
            </div>

            {/* API error */}
            {apiError && (
              <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-md px-3 py-2">
                {apiError}
              </p>
            )}

            {/* Success */}
            {success && (
              <p className="text-sm text-green-400 bg-green-900/20 border border-green-800 rounded-md px-3 py-2">
                Password updated.
              </p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={saving}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-gray-50 text-sm font-medium rounded-md transition-colors"
            >
              {saving ? 'Saving…' : 'Update password'}
            </button>
      </form>
    </div>
  )
}
