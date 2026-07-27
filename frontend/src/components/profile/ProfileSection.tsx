import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
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

/** Round avatar: the photo if present, else the name's first letter. Reusable in headers.
 *  When `onClick` is set (and a photo exists) it becomes a button that opens the lightbox. */
export function Avatar({ name, photo, size = 64, onClick, ring }: { name?: string | null; photo?: string | null; size?: number; onClick?: () => void; ring?: boolean }) {
  const clickable = !!(onClick && photo)
  const base: React.CSSProperties = {
    width: size, height: size, borderRadius: '50%', flex: '0 0 auto', overflow: 'hidden',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(150deg,rgba(201,168,76,0.28),rgba(201,168,76,0.06))',
    border: ring ? '2px solid rgba(201,168,76,0.55)' : '1px solid var(--line)',
    color: 'var(--gold-light)', fontFamily: 'var(--f-serif)',
    fontWeight: 800, fontSize: Math.round(size * 0.42),
    cursor: clickable ? 'zoom-in' : 'default',
    boxShadow: ring ? '0 6px 22px -8px rgba(0,0,0,0.6)' : 'none',
    padding: 0,
  }
  const inner = photo
    ? <img src={photo} alt={name ? `${name} profile photo` : 'Profile photo'} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    : <span aria-hidden="true">{String(name || '?').trim().charAt(0).toUpperCase()}</span>
  if (clickable) return <button type="button" onClick={onClick} title="View photo" style={base}>{inner}</button>
  return <span style={base}>{inner}</span>
}

/** Full-screen image viewer. Click the backdrop or press Esc to close. */
export function Lightbox({ src, alt, onClose }: { src: string; alt?: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'grid', placeItems: 'center', padding: 24, zIndex: 10000, cursor: 'zoom-out' }}>
      <img src={src} alt={alt || 'Profile photo'} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 'min(92vw,620px)', maxHeight: '88vh', borderRadius: 16, boxShadow: '0 30px 80px -20px rgba(0,0,0,0.8)', objectFit: 'contain', cursor: 'default' }} />
      <button type="button" onClick={onClose} aria-label="Close" style={{ position: 'fixed', top: 18, right: 20, width: 42, height: 42, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
    </div>,
    document.body,
  )
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
  const [zoom, setZoom] = useState(false)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', minWidth: 0 }}>
      <Avatar name={name} photo={value} size={88} ring={!!value} onClick={() => setZoom(true)} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <label className={`btn btn--sm${busy ? ' is-disabled' : ''}`} style={{ cursor: busy ? 'default' : 'pointer' }}>
            {busy ? 'Uploading…' : value ? 'Change photo' : 'Add profile photo (optional)'}
            <input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={busy} onChange={onPick} />
          </label>
          {value && <button type="button" className="btn btn--sm" disabled={busy} onClick={() => onChange('')}>Remove</button>}
        </div>
        {value ? <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: 0 }}>Tap the photo to preview it larger.</p> : null}
        {err && <p style={{ ...errS, margin: 0 }}>{err}</p>}
      </div>
      {zoom && value && <Lightbox src={value} alt="Profile photo preview" onClose={() => setZoom(false)} />}
    </div>
  )
}

/** Upload / change / remove the user's profile photo (users.avatar_url). */
export function ProfilePhotoCard() {
  const { user, refresh } = useAuth()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [zoom, setZoom] = useState(false)
  // Optimistic preview: show the just-uploaded image immediately, even before
  // refresh() round-trips, so the preview never looks empty after an upload.
  const [preview, setPreview] = useState<string | null>(null)
  const photo = preview ?? (user?.avatar_url || '')
  // Once the auth user reflects the saved photo, drop the optimistic override.
  useEffect(() => { if (preview && user?.avatar_url === preview) setPreview(null) }, [user?.avatar_url, preview])

  const onPick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { setErr('Please choose an image file (JPG, PNG, or WebP).'); return }
    if (file.size > MAX_PHOTO_BYTES) { setErr('Image must be 5 MB or smaller.'); return }
    setErr(''); setBusy(true)
    try {
      const up = await api.upload<{ url: string }>('new-school/upload', file)
      setPreview(up.url) // instant preview
      await api.post('new-school/profile/photo', { avatar_url: up.url })
      await refresh()
      window.fcToast?.('Profile photo updated.')
    } catch (e) { setPreview(null); setErr(e instanceof Error ? e.message : 'Could not upload the photo.') }
    finally { setBusy(false) }
  }
  const removePhoto = async () => {
    setBusy(true); setErr('')
    try {
      await api.post('new-school/profile/photo', { avatar_url: '' })
      setPreview(null)
      await refresh()
      window.fcToast?.('Profile photo removed.')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not remove the photo.') }
    finally { setBusy(false) }
  }

  return (
    <article className="glass" style={cardS}>
      <h3 style={headS}>Profile Photo</h3>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center', minWidth: 0 }}>
        <Avatar name={user?.full_name} photo={photo} size={140} ring onClick={() => setZoom(true)} />
        <div style={{ minWidth: 0 }}>
          <div style={{ color: 'var(--ivory)', fontWeight: 700, fontSize: 15 }}>{user?.full_name || 'Your profile'}</div>
          <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '2px 0 0' }}>
            {photo ? 'Tap your photo to view it full size.' : 'Add a photo so people recognise you.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          <label className={`btn btn--sm btn--solid${busy ? ' is-disabled' : ''}`} style={{ cursor: busy ? 'default' : 'pointer' }}>
            {busy ? 'Uploading…' : photo ? 'Change photo' : 'Upload photo'}
            <input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={busy} onChange={onPick} />
          </label>
          {photo && <button type="button" className="btn btn--sm" disabled={busy} onClick={() => void removePhoto()}>Remove</button>}
        </div>
        <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>Image only (JPG, PNG, WebP) · max 5 MB</p>
      </div>
      {err && <p style={{ ...errS, textAlign: 'center' }}>{err}</p>}
      {zoom && photo && <Lightbox src={photo} alt={`${user?.full_name || 'Your'} profile photo`} onClose={() => setZoom(false)} />}
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
  const fieldS: React.CSSProperties = { display: 'grid', gap: 7, minWidth: 0 }
  const labelS: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--gold-light)' }
  return (
    <article className="glass" style={{ ...cardS, padding: 'clamp(20px,3.5vw,28px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <span style={{ width: 42, height: 42, flex: '0 0 auto', borderRadius: 12, display: 'grid', placeItems: 'center', background: 'linear-gradient(150deg,rgba(201,168,76,0.28),rgba(201,168,76,0.06))', border: '1px solid var(--line)', color: 'var(--gold-light)' }}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.7}><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 018 0v3" /><circle cx="12" cy="15.5" r="1.4" fill="currentColor" stroke="none" /></svg>
        </span>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ ...headS, margin: 0 }}>Change Password</h3>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '3px 0 0' }}>Keep your account secure with a strong password.</p>
        </div>
      </div>
      <div style={{ height: 1, background: 'var(--line)', margin: '14px 0 18px' }} />
      <style>{`
        .fc-pw-big .ns-pw { width: 100%; }
        .fc-pw-big .ns-pw input {
          width: 100%;
          box-sizing: border-box;
          padding: 15px 46px 15px 16px;
          font-size: 15.5px;
          color: var(--ivory, #f4efe4);
          background: rgba(0,0,0,0.28);
          border: 1px solid var(--line);
          border-radius: 12px;
          outline: none;
          transition: border-color .2s, box-shadow .2s;
        }
        .fc-pw-big .ns-pw input:focus {
          border-color: rgba(201,168,76,0.6);
          box-shadow: 0 0 0 3px rgba(201,168,76,0.15);
        }
        .fc-pw-big .ns-pw input::placeholder { color: var(--muted); }
        .fc-pw-big .ns-pw__toggle { width: 40px; height: 40px; top: 50%; right: 6px; }
      `}</style>
      <form onSubmit={submit} noValidate className="fc-pw-big" style={{ display: 'grid', gap: 18, minWidth: 0 }}>
        <label style={fieldS}><span style={labelS}>Current Password</span><PasswordField name="current_password" autoComplete="current-password" /></label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(220px,100%),1fr))', gap: 16, minWidth: 0 }}>
          <label style={fieldS}><span style={labelS}>New Password</span><PasswordField name="new_password" /></label>
          <label style={fieldS}><span style={labelS}>Confirm New Password</span><PasswordField name="confirm_new_password" /></label>
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--gold-light)' }}>ⓘ</span> At least 8 characters, including a letter and a number.
        </p>
        {err && <p style={{ ...errS, margin: 0 }}>{err}</p>}
        <button className="btn btn--solid" type="submit" disabled={busy} style={{ justifySelf: 'start', minWidth: 180 }}>{busy ? 'Saving…' : 'Update Password'}</button>
      </form>
    </article>
  )
}

/** Drop-in profile section: photo + password, responsive (two columns on wide screens). */
export default function ProfileSection() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(300px,100%),1fr))', gap: 16, alignItems: 'start', minWidth: 0 }}>
      <ProfilePhotoCard />
      <ChangePasswordCard />
    </div>
  )
}
