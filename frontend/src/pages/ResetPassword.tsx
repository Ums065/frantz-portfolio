import { useMemo, useState } from 'react'
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
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
            {!token ? (
              <>
                <h1 className="gold-text" style={{ marginTop: 0 }}>Invalid Link</h1>
                <p className="msub">This password reset link is missing its token. Please request a new one from the sign-in screen.</p>
                <Link className="btn btn--solid" to="/">Back to Home</Link>
              </>
            ) : done ? (
              <>
                <h1 className="gold-text" style={{ marginTop: 0 }}>Password Reset</h1>
                <p className="msub">Your password has been updated. You can now sign in with your new password.</p>
                <button className="btn btn--solid" onClick={() => navigate('/')}>Go to Home</button>
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
                      minLength={6}
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
                      minLength={6}
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
