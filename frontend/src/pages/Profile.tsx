import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { resolveDashboardRoute } from '../lib/dashboardRoute'
import { useSeo } from '../hooks/useSeo'
import { api } from '../lib/api'
import PasswordInput from '../components/PasswordInput'
import { AvatarPicker } from '../components/profile/ProfileSection'

export default function Profile() {
  useSeo({ title: 'Your Profile', noindex: true })
  const { user, loading, refresh } = useAuth()

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState('')
  const [curPw, setCurPw] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const startEdit = () => {
    if (!user) return
    setName(user.full_name || ''); setAvatar(user.avatar_url || '')
    setCurPw(''); setPw(''); setPw2(''); setMsg(''); setErr(''); setEditing(true)
  }
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setMsg('')
    if (name.trim() === '') { setErr('Name is required.'); return }
    if (pw) {
      if (!curPw) { setErr('Enter your current password to set a new one.'); return }
      if (pw !== pw2) { setErr('The new passwords do not match.'); return }
    }
    setBusy(true)
    try {
      await api.put('user/profile', { full_name: name.trim(), avatar_url: avatar, ...(pw ? { current_password: curPw, password: pw } : {}) })
      await refresh(); setMsg('Profile updated.'); setEditing(false)
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : 'Could not save your profile.') } finally { setBusy(false) }
  }

  if (loading) {
    return (
      <section className="profile-page">
        <div className="profile-card glass"><p className="profile-page__muted">Loading...</p></div>
      </section>
    )
  }

  if (!user) {
    return (
      <section className="profile-page">
        <div className="profile-card glass">
          <p className="eyebrow">Member Area</p>
          <h1 className="gold-text">Profile</h1>
          <p className="profile-page__muted">Please sign in using the <strong>Login</strong> button in the top header to view and edit your profile.</p>
          <div className="profile-actions">
            <Link className="btn btn--solid" to="/">Back to Home</Link>
          </div>
        </div>
      </section>
    )
  }

  const fullName = user.full_name || ''
  const initial = fullName.trim().charAt(0).toUpperCase() || 'U'
  const approvalStatus = (user.approval_status || 'approved').toString()
  const statusLabel = approvalStatus === 'approved' ? 'Active' : approvalStatus === 'rejected' ? 'Rejected' : 'Pending review'

  return (
    <section className="profile-page">
      <div className="profile-card glass">
        <p className="eyebrow">Account</p>
        <h1 className="gold-text">Profile</h1>
        <div className="profile-summary">
          <div className="profile-summary__avatar" aria-hidden="true">
            {user.avatar_url ? <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} /> : initial}
          </div>
          <div>
            <h2>{fullName}</h2>
            <p>{user.email}</p>
          </div>
        </div>

        {!editing ? (
          <>
            <div className="profile-grid">
              <div><span>Name</span><strong>{fullName}</strong></div>
              <div><span>Email</span><strong>{user.email}</strong></div>
              <div><span>Role</span><strong>{user.role}</strong></div>
              <div><span>Status</span><strong>{statusLabel}</strong></div>
              <div><span>Joined</span><strong>{new Date(user.created_at).toLocaleDateString()}</strong></div>
            </div>
            {approvalStatus !== 'approved' && (
              <p className="profile-page__muted" style={{ marginTop: 14 }}>
                {approvalStatus === 'rejected' ? 'This account was rejected by admin.' : 'This account is waiting for admin approval.'}
              </p>
            )}
            {msg && <p className="profile-page__muted" style={{ marginTop: 12, color: '#6be29a' }}>{msg}</p>}
            <div className="profile-actions">
              <button className="btn btn--sm btn--solid" onClick={startEdit}>Edit Profile</button>
              <Link className="btn btn--sm" to={resolveDashboardRoute(user.role)}>Dashboard</Link>
              <Link className="btn btn--sm" to="/">View Site</Link>
            </div>
          </>
        ) : (
          <form onSubmit={save} style={{ marginTop: 16 }}>
            <div className="field"><label>Profile photo</label>
              <AvatarPicker value={avatar} onChange={setAvatar} name={name} /></div>
            <div className="field"><label>Full name</label>
              <input type="text" required value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div style={{ borderTop: '1px solid rgba(212,175,55,0.18)', margin: '10px 0 14px', paddingTop: 12 }}>
              <p style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gold, #d4af37)', margin: '0 0 10px' }}>Change password <span style={{ color: 'var(--muted)', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>(optional)</span></p>
              <div className="field"><label>Current password</label>
                <PasswordInput value={curPw} onChange={(e) => setCurPw(e.target.value)} autoComplete="current-password" placeholder="Your current password" /></div>
              <div className="field"><label>New password</label>
                <PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" placeholder="At least 8 characters" /></div>
              <div className="field"><label>Confirm new password</label>
                <PasswordInput value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" placeholder="Repeat the new password" /></div>
            </div>
            {err && <p className="msub" style={{ color: '#e08a8a' }}>{err}</p>}
            <div className="profile-actions">
              <button type="submit" className="btn btn--sm btn--solid" disabled={busy}>{busy ? 'Saving…' : 'Save Changes'}</button>
              <button type="button" className="btn btn--sm" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
            </div>
          </form>
        )}
      </div>
    </section>
  )
}
