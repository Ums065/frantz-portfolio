import { useState, type ChangeEvent, type FormEvent } from 'react'
import { api } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { PasswordField } from '../../lib/registrationForm'

/* Shared, role-agnostic profile section: a profile-photo card + a change-password
   card. Backed entirely by existing endpoints (POST new-school/profile/photo and
   new-school/profile/password are both require_login + role-agnostic), so this
   drops into any dashboard. Self-contained styling (glass + inline) so it looks
   consistent everywhere. */

const MAX_PHOTO_BYTES = 5 * 1024 * 1024

const cardS: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '1px solid var(--line)', borderRadius: 14, padding: 'clamp(16px,3vw,20px)', minWidth: 0, maxWidth: '100%' }
const headS: React.CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--gold)', margin: '0 0 14px' }
const errS: React.CSSProperties = { color: '#ff9a9a', fontSize: 12.5, margin: '8px 0 0' }

/** Round avatar: the photo if present, else the name's first letter. Reusable in headers. */
export function Avatar({ name, photo, size = 64 }: { name?: string | null; photo?: string | null; size?: number }) {
  const base: React.CSSProperties = {
    width: size, height: size, borderRadius: '50%', flex: '0 0 auto', overflow: 'hidden',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(150deg,rgba(201,168,76,0.28),rgba(201,168,76,0.06))',
    border: '1px solid var(--line)', color: 'var(--gold-light)', fontFamily: 'var(--f-serif)',
    fontWeight: 800, fontSize: Math.round(size * 0.42),
  }
  if (photo) return <span style={base}><img src={photo} alt={name ? `${name} profile photo` : 'Profile photo'} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></span>
  return <span style={base} aria-hidden="true">{String(name || '?').trim().charAt(0).toUpperCase()}</span>
}

/** Pre-account photo picker for registration forms. Uploads immediately and
 *  hands back the URL via onChange; the form includes it as `avatar_url`. Optional. */
export function AvatarPicker({ value, onChange, name }: { value: string; onChange: (url: string) => void; name?: string }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const onPick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { setErr('Please choose an image file (JPG, PNG, or WebP).'); return }
    if (file.size > MAX_PHOTO_BYTES) { setErr('Image must be 5 MB or smaller.'); return }
    setErr(''); setBusy(true)
    try {
      const up = await api.upload<{ url: string }>('new-school/upload', file)
      onChange(up.url)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not upload the photo.') }
    finally { setBusy(false) }
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', minWidth: 0 }}>
      <Avatar name={name} photo={value} size={56} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <label className={`btn btn--sm${busy ? ' is-disabled' : ''}`} style={{ cursor: busy ? 'default' : 'pointer' }}>
            {busy ? 'Uploading…' : value ? 'Change photo' : 'Add profile photo (optional)'}
            <input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={busy} onChange={onPick} />
          </label>
          {value && <button type="button" className="btn btn--sm" disabled={busy} onClick={() => onChange('')}>Remove</button>}
        </div>
        {err && <p style={{ ...errS, margin: 0 }}>{err}</p>}
      </div>
    </div>
  )
}

/** Upload / change / remove the user's profile photo (users.avatar_url). */
export function ProfilePhotoCard() {
  const { user, refresh } = useAuth()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const photo = user?.avatar_url || ''

  const onPick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { setErr('Please choose an image file (JPG, PNG, or WebP).'); return }
    if (file.size > MAX_PHOTO_BYTES) { setErr('Image must be 5 MB or smaller.'); return }
    setErr(''); setBusy(true)
    try {
      const up = await api.upload<{ url: string }>('new-school/upload', file)
      await api.post('new-school/profile/photo', { avatar_url: up.url })
      await refresh()
      window.fcToast?.('Profile photo updated.')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not upload the photo.') }
    finally { setBusy(false) }
  }
  const removePhoto = async () => {
    setBusy(true); setErr('')
    try {
      await api.post('new-school/profile/photo', { avatar_url: '' })
      await refresh()
      window.fcToast?.('Profile photo removed.')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not remove the photo.') }
    finally { setBusy(false) }
  }

  return (
    <article className="glass" style={cardS}>
      <h3 style={headS}>Profile Photo</h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', minWidth: 0 }}>
        <Avatar name={user?.full_name} photo={photo} size={72} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <label className={`btn btn--sm${busy ? ' is-disabled' : ''}`} style={{ cursor: busy ? 'default' : 'pointer' }}>
              {busy ? 'Uploading…' : photo ? 'Change photo' : 'Upload photo'}
              <input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={busy} onChange={onPick} />
            </label>
            {photo && <button type="button" className="btn btn--sm" disabled={busy} onClick={() => void removePhoto()}>Remove</button>}
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: 0 }}>Image only (JPG, PNG, WebP) · max 5 MB</p>
        </div>
      </div>
      {err && <p style={errS}>{err}</p>}
    </article>
  )
}

/** Change the current user's password (verifies current, evicts other sessions). */
export function ChangePasswordCard() {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const fd = new FormData(form)
    const current = String(fd.get('current_password') || '')
    const next = String(fd.get('new_password') || '')
    const confirm = String(fd.get('confirm_new_password') || '')
    if (next.length < 8 || !/[A-Za-z]/.test(next) || !/\d/.test(next)) {
      setErr('New password must be at least 8 characters and include a letter and a number.'); return
    }
    if (next !== confirm) { setErr('New passwords do not match.'); return }
    setErr(''); setBusy(true)
    try {
      await api.post('new-school/profile/password', { current_password: current, new_password: next })
      form.reset()
      window.fcToast?.('Password updated.')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not change your password.') }
    finally { setBusy(false) }
  }
  const fieldS: React.CSSProperties = { display: 'grid', gap: 5, minWidth: 0 }
  const labelS: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--gold-light)' }
  return (
    <article className="glass" style={cardS}>
      <h3 style={headS}>Change Password</h3>
      <form onSubmit={submit} noValidate>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(200px,100%),1fr))', gap: 12, minWidth: 0 }}>
          <label style={{ ...fieldS, gridColumn: '1 / -1' }}><span style={labelS}>Current Password</span><PasswordField name="current_password" autoComplete="current-password" /></label>
          <label style={fieldS}><span style={labelS}>New Password</span><PasswordField name="new_password" /></label>
          <label style={fieldS}><span style={labelS}>Confirm New Password</span><PasswordField name="confirm_new_password" /></label>
        </div>
        {err && <p style={errS}>{err}</p>}
        <button className="btn btn--sm btn--solid" type="submit" disabled={busy} style={{ marginTop: 14 }}>{busy ? 'Saving…' : 'Update Password'}</button>
      </form>
    </article>
  )
}

/** Drop-in profile section: photo + password, responsive. */
export default function ProfileSection() {
  return (
    <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
      <ProfilePhotoCard />
      <ChangePasswordCard />
    </div>
  )
}
