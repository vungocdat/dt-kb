import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { changePassword } from '../../api'

export const Route = createFileRoute('/_auth/settings')({
  component: SettingsPage,
})

function SettingsPage() {
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

        {/* Change password card */}
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
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors"
            >
              {saving ? 'Saving…' : 'Update password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
