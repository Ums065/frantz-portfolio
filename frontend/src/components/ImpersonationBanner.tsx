import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * Global red bar shown while an admin is "viewing as" another user. Clicking it
 * restores the original admin session and returns to the admin dashboard.
 * Renders nothing when not impersonating, so it is safe to mount app-wide.
 */
export default function ImpersonationBanner() {
  const { impersonating, impersonator, user, stopImpersonating } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)

  if (!impersonating) return null

  const exit = async () => {
    if (busy) return
    setBusy(true)
    try {
      await stopImpersonating()
      navigate('/admin')
    } catch {
      // If the restore fails, send them to admin anyway; auth/me will reconcile.
      navigate('/admin')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="impersonation-banner" role="alert">
      <div className="impersonation-banner__text">
        <span className="impersonation-banner__dot" aria-hidden="true" />
        <span>
          Viewing as <strong>{user?.full_name ?? 'user'}</strong>
          {user?.role ? <span className="impersonation-banner__role"> ({user.role})</span> : null}
          {impersonator ? <span className="impersonation-banner__meta"> — admin: {impersonator.full_name}</span> : null}
        </span>
      </div>
      <button type="button" className="impersonation-banner__exit" onClick={exit} disabled={busy}>
        {busy ? 'Returning…' : '← Back to Admin Dashboard'}
      </button>
    </div>
  )
}
