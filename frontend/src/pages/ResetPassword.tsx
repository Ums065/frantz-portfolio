import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'

/**
 * Landing page for the password-reset link emailed to a user.
 * Reads ?token=... from the URL, lets the user pick a new password, and posts
 * it to auth/reset-password. On success the user is pointed back to sign in.
 */
export default function ResetPassword() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = useMemo(() => (params.get('token') || '').trim(), [params])

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  // Validate the token on load (without consuming it) so an already-used or
  // expired link shows an error page instead of the form.
  const [checking, setChecking] = useState(true)
  const [valid, setValid] = useState(false)

  useEffect(() => {
    let active = true
    if (!token) {
      setChecking(false)
      setValid(false)
      return
    }
    setChecking(true)
    api.get<{ valid: boolean }>(`auth/reset-password/verify?token=${encodeURIComponent(token)}`)
      .then((d) => { if (active) setValid(Boolean(d.valid)) })
      .catch(() => { if (active) setValid(false) })
      .finally(() => { if (active) setChecking(false) })
    return () => { active = false }
  }, [token])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setError('Password must be at least 8 characters and include a letter and a number.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setBusy(true)
    try {
      await api.post<{ message: string }>('auth/reset-password', { token, password })
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset your password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page">
      <section className="page-hero">
        <div className="wrap" style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}>
          <div className="glass" style={{ padding: '28px 26px', maxWidth: 460, width: '100%' }}>
            {done ? (
              <>
                <h1 className="gold-text" style={{ marginTop: 0 }}>Password Reset</h1>
                <p className="msub">Your password has been updated. You can now sign in with your new password.</p>
                <button className="btn btn--solid" onClick={() => navigate('/')}>Go to Home</button>
              </>
            ) : checking ? (
              <>
                <h1 className="gold-text" style={{ marginTop: 0 }}>Checking link…</h1>
                <p className="msub">Please wait while we verify your reset link.</p>
              </>
            ) : (!token || !valid) ? (
              <>
                <h1 className="gold-text" style={{ marginTop: 0 }}>Link Expired or Invalid</h1>
                <p className="msub">This password reset link is invalid, has expired, or has already been used. Please request a new one from the sign-in screen.</p>
                <Link className="btn btn--solid" to="/">Back to Home</Link>
              </>
            ) : (
              <>
                <h1 className="gold-text" style={{ marginTop: 0 }}>Set a New Password</h1>
                <p className="msub">Choose a new password for your account.</p>
                <form onSubmit={submit} className="auth-form">
                  <div className="field">
                    <label>New Password</label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      placeholder="At least 6 characters"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>Confirm Password</label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      placeholder="Repeat the password"
                      autoComplete="new-password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                    />
                  </div>
                  {error && <p className="msub" style={{ color: '#e08a8a' }}>{error}</p>}
                  <button type="submit" className="btn btn--solid" disabled={busy}>
                    {busy ? 'Saving...' : 'Reset Password'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}
