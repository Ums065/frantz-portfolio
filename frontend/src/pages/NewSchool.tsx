import { useEffect, useState, type ChangeEvent, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { buildLocalQrDataUri } from '../lib/localQr.js'
import { useAuth } from '../context/AuthContext'
import { FRANTZ_SIGNATURE } from '../lib/brandAssets'
import { useSeo } from '../hooks/useSeo'
import { resolveDashboardRoute } from '../lib/dashboardRoute'
import { awards } from '../lib/awards'
import TermsAgreement from '../components/TermsAgreement'
import DashboardGuide from '../components/DashboardGuide'
import ScholarshipWizard, { type ScholarshipAnswer } from '../components/ScholarshipWizard'
import NsRecordDetail from '../components/NsRecordDetail'
import ChallengeRegistration from '../components/ChallengeRegistration'
import { PasswordField } from '../lib/registrationForm'
import { DASHBOARD_FAQ } from '../lib/dashboardGuide'
import { CHALLENGE_TERMS_VERSION } from '../lib/terms'
import { recordTermsAcceptance } from '../lib/recordTermsAcceptance'

const isAdminRole = (role?: string) => ['admin', 'super_admin', 'editor'].includes(role || '')

/** Whole-years age from a YYYY-MM-DD date of birth, or '' if blank/invalid. */
const ageFromDob = (dob: string): string => {
  if (!dob) return ''
  const d = new Date(`${dob}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  const today = new Date()
  let age = today.getFullYear() - d.getFullYear()
  const m = today.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age -= 1
  return age >= 0 && age < 150 ? String(age) : ''
}

const value = (fd: FormData, key: string) => String(fd.get(key) ?? '').trim()
const checked = (fd: FormData, key: string) => fd.get(key) !== null
const fileValue = (fd: FormData, key: string) => {
  const item = fd.get(key)
  return item instanceof File && item.size > 0 ? item : null
}
const asArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])
const formatMoney = (amount: any) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(amount || 0))

const formatDateLabel = (value?: string) => {
  if (!value) return 'To be announced'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

const formatLongDateLabel = (value?: string) => {
  if (!value) return 'To be announced'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

const formatSyncTime = (value?: number | null) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

const firstPositive = (...values: Array<unknown>) => {
  for (const raw of values) {
    const n = Number(raw)
    if (Number.isFinite(n) && n > 0) return n
  }
  return 0
}

const getChallengeProgressPercent = (challenge: Record<string, any>, students: number, submissions: number) => {
  if (students > 0 && submissions > 0) {
    const ratio = Math.round((submissions / students) * 100)
    if (Number.isFinite(ratio) && ratio > 0) return Math.min(100, ratio)
  }

  const start = new Date(String(challenge.registration_open || '2026-06-27'))
  const end = new Date(String(challenge.winners_announced || '2026-12-21'))
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) return 0

  const now = Date.now()
  if (now <= start.getTime()) return 0
  if (now >= end.getTime()) return 100
  return Math.max(1, Math.round(((now - start.getTime()) / (end.getTime() - start.getTime())) * 100))
}
const escapeCsv = (value: unknown) => {
  const text = String(value ?? '')
  const escaped = text.replace(/"/g, '""')
  return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped
}

const buildCsv = (rows: Record<string, unknown>[]) => {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const lines = [headers.join(',')]
  rows.forEach((row) => {
    lines.push(headers.map((header) => escapeCsv(row[header])).join(','))
  })
  return lines.join('\n')
}

const downloadCsvFile = (filename: string, rows: Record<string, unknown>[]) => {
  const csv = buildCsv(rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const qrImageSrc = (target?: string) => {
  if (!target || typeof window === 'undefined') return ''
  try {
    const absolute = new URL(target, window.location.origin).toString()
    return buildLocalQrDataUri(absolute)
  } catch {
    return ''
  }
}

async function uploadIfPresent(file: File | null): Promise<string> {
  if (!file) return ''
  const res = await api.upload<{ url: string }>('new-school/upload', file)
  return res.url
}

function clipText(text: string, max = 120) {
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max - 1)}...` : text
}

// ---- Student form validation helpers ----
const countWords = (text: string) => (text.trim().match(/\S+/g) || []).length
/** Throw a friendly error if a long-answer field isn't between min..max words. */
function assertWordRange(text: string, label: string, min = 50, max = 500) {
  const n = countWords(text)
  if (n < min) throw new Error(`${label} needs at least ${min} words — you wrote ${n}.`)
  if (n > max) throw new Error(`${label} must be ${max} words or fewer — you wrote ${n}.`)
}
/** Throw if a short field is under a character minimum (a single letter is never valid). */
function assertMinChars(text: string, label: string, min = 3) {
  if (text.trim().length < min) throw new Error(`${label} must be at least ${min} characters.`)
}
/** Today's date as YYYY-MM-DD in the local timezone (for <input type="date"> min/max). */
const todayInputDate = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const MAX_VIDEO_BYTES = 70 * 1024 * 1024
const MAX_DOC_BYTES = 5 * 1024 * 1024

// ---- Inline (below-field) registration validation ----
// Each helper RETURNS an error string ('' = valid) so a submit handler can build a
// { fieldName: message } map and render the message under the matching field instead
// of a popup. Empty entries are pruned before deciding whether the form is valid.
type FieldErrors = Record<string, string>
const REQUIRED_MSG = 'This field is required.'
const vRequired = (v: string, msg = REQUIRED_MSG) => (v.trim() ? '' : msg)
const vMinChars = (v: string, min: number, label = 'This field') =>
  !v.trim() ? REQUIRED_MSG : v.trim().length >= min ? '' : `${label} must be at least ${min} characters.`
const vEmail = (v: string) =>
  !v.trim() ? REQUIRED_MSG : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? '' : 'Enter a valid email address.'
const vPhone = (v: string, required = true) => {
  const digits = v.replace(/\D/g, '')
  if (!digits) return required ? REQUIRED_MSG : ''
  return digits.length >= 7 && digits.length <= 15 ? '' : 'Enter a valid phone number (7–15 digits).'
}
const vZip = (v: string) =>
  !v.trim() ? REQUIRED_MSG : /^[A-Za-z0-9][A-Za-z0-9 -]{2,9}$/.test(v.trim()) ? '' : 'Enter a valid ZIP / postal code.'
const vUrl = (v: string, required = false) =>
  !v.trim() ? (required ? REQUIRED_MSG : '') : /^https?:\/\/[^\s.]+\.[^\s]+$/.test(v.trim()) ? '' : 'Enter a full URL (https://…).'
const vPassword = (v: string) => (!v ? REQUIRED_MSG : v.length >= 6 ? '' : 'Password must be at least 6 characters.')
const vUsername = (v: string) =>
  !v.trim()
    ? REQUIRED_MSG
    : /^[A-Za-z0-9._-]{3,30}$/.test(v.trim())
      ? ''
      : 'Username must be 3–30 characters: letters, numbers, dot, dash or underscore.'

/**
 * Live, as-you-type input filtering keyed off the field's `name`. Strips characters
 * that can never be valid (letters in a phone number, symbols in a ZIP) and hard-caps
 * the length, so the user simply cannot enter junk. Returns the cleaned value.
 */
const sanitizeField = (name: string, value: string): string => {
  if (name === 'student_username') return value.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 30)
  if (/phone/i.test(name) || name === 'main_phone') return value.replace(/[^\d+\-() ]/g, '').slice(0, 20)
  if (name === 'addr_zip') return value.replace(/[^A-Za-z0-9 -]/g, '').slice(0, 10)
  if (/email/i.test(name)) return value.replace(/\s/g, '').slice(0, 254)
  if (name === 'password' || name === 'confirm_password') return value.slice(0, 64)
  if (name === 'addr_floor') return value.slice(0, 20)
  if (name === 'grade_level' || name === 'addr_state' || name === 'addr_country') return value.slice(0, 40)
  if (/website|url/i.test(name)) return value.replace(/\s/g, '').slice(0, 200)
  if (name === 'digital_signature') return value.slice(0, 80)
  // Generic text fields: names, addresses, school/role fields — cap at a sane length.
  return value.slice(0, 100)
}

/** Drop the '' (valid) entries so the caller can test `Object.keys(...).length`. */
const pruneErrors = (errs: FieldErrors): FieldErrors =>
  Object.fromEntries(Object.entries(errs).filter(([, msg]) => msg))

/** Scroll to and focus the first field that has an error. */
const focusFirstError = (form: HTMLFormElement, errs: FieldErrors) => {
  const first = Object.keys(errs)[0]
  if (!first) return
  const el = form.querySelector<HTMLElement>(`[name="${first}"]`)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    window.setTimeout(() => el.focus?.(), 250)
  }
}

/** Map a server-side registration error to the field it belongs to (duplicate username / email). */
const mapRegisterError = (err: unknown, emailField = 'email'): FieldErrors | null => {
  const m = (err instanceof Error ? err.message : '').toLowerCase()
  if (m.includes('username')) return { student_username: 'That username is already taken — please choose another.' }
  if (m.includes('email') && (m.includes('use') || m.includes('exist') || m.includes('registered') || m.includes('account') || m.includes('taken')))
    return { [emailField]: 'An account with this email already exists.' }
  return null
}

/** Combine the split address inputs (addr_*) into one stored address line. */
const joinAddress = (fd: FormData, prefix = 'addr_') => {
  const street = value(fd, `${prefix}street`)
  const floor = value(fd, `${prefix}floor`)
  const city = value(fd, `${prefix}city`)
  const state = value(fd, `${prefix}state`)
  const zip = value(fd, `${prefix}zip`)
  const country = value(fd, `${prefix}country`)
  const line1 = [street, floor].filter(Boolean).join(', ')
  const cityZip = [[city, state].filter(Boolean).join(', '), zip].filter(Boolean).join(' ')
  return [line1, cityZip, country].filter(Boolean).join(', ')
}

/** Build the { addr_*: error } slice for a required address (floor is optional). */
const validateAddress = (fd: FormData, prefix = 'addr_'): FieldErrors => ({
  [`${prefix}street`]: vRequired(value(fd, `${prefix}street`)),
  [`${prefix}city`]: vRequired(value(fd, `${prefix}city`)),
  [`${prefix}state`]: vRequired(value(fd, `${prefix}state`)),
  [`${prefix}zip`]: vZip(value(fd, `${prefix}zip`)),
  [`${prefix}country`]: vRequired(value(fd, `${prefix}country`)),
})

/** Inline error message rendered directly under a form field. */
function FieldError({ msg, full = false }: { msg?: string; full?: boolean }) {
  if (!msg) return null
  return <span className={`ns-field-error${full ? ' ns-field--full' : ''}`} role="alert">{msg}</span>
}

/** Avatar contents: the uploaded photo if present, otherwise the name's first letter.
 *  Drop this inside any existing avatar/initial <span> to show profile photos everywhere. */
const avatarInner = (name: any, photo?: string | null): ReactNode =>
  photo ? <img className="ns-avatar-img" src={photo} alt="" loading="lazy" /> : String(name || '?').trim().charAt(0).toUpperCase()

/** Profile photo upload card shown in each role's Profile tab. Image only, max 5 MB,
 *  stored once on the user account (users.avatar_url) so it appears everywhere. */
function ProfilePhotoCard() {
  const { user, refresh } = useAuth()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const photo = user?.avatar_url || ''
  const onPick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { setErr('Please choose an image file (JPG, PNG, or WebP).'); return }
    if (file.size > MAX_DOC_BYTES) { setErr('Image must be 5 MB or smaller.'); return }
    setErr('')
    setBusy(true)
    try {
      const up = await api.upload<{ url: string }>('new-school/upload', file)
      await api.post('new-school/profile/photo', { avatar_url: up.url })
      await refresh()
      window.fcToast?.('Profile photo updated.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not upload the photo.')
    } finally {
      setBusy(false)
    }
  }
  const removePhoto = async () => {
    setBusy(true)
    setErr('')
    try {
      await api.post('new-school/profile/photo', { avatar_url: '' })
      await refresh()
      window.fcToast?.('Profile photo removed.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not remove the photo.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <article className="glass ns-dash-card reveal in ns-photo-card">
      <div className="ns-dash-card__head"><span className="eyebrow">Profile Photo</span></div>
      <div className="ns-photo-card__body">
        <span className="ns-photo-avatar">{avatarInner(user?.full_name, photo)}</span>
        <div className="ns-photo-card__actions">
          <label className={`btn btn--sm${busy ? ' is-disabled' : ''}`}>
            {busy ? 'Uploading…' : photo ? 'Change photo' : 'Upload photo'}
            <input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={busy} onChange={onPick} />
          </label>
          {photo && <button type="button" className="btn btn--sm" disabled={busy} onClick={() => void removePhoto()}>Remove</button>}
          <p className="ns-photo-card__hint">Image only (JPG, PNG, WebP) · max 5 MB</p>
        </div>
      </div>
      {err && <p className="ns-field-error">{err}</p>}
    </article>
  )
}

/** Change-password card shown in every role's Profile tab. */
function ChangePasswordCard() {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const fd = new FormData(form)
    const current = String(fd.get('current_password') || '')
    const next = String(fd.get('new_password') || '')
    const confirm = String(fd.get('confirm_new_password') || '')
    if (next.length < 6) { setErr('New password must be at least 6 characters.'); return }
    if (next !== confirm) { setErr('New passwords do not match.'); return }
    setErr('')
    setBusy(true)
    try {
      await api.post('new-school/profile/password', { current_password: current, new_password: next })
      form.reset()
      window.fcToast?.('Password updated.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not change your password.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <article className="glass ns-dash-card reveal in">
      <div className="ns-dash-card__head"><span className="eyebrow">Change Password</span></div>
      <form onSubmit={submit} noValidate>
        <div className="ns-field-grid">
          <label className="ns-field ns-field--full"><span>Current Password</span><PasswordField name="current_password" autoComplete="current-password" /></label>
          <label className="ns-field"><span>New Password</span><PasswordField name="new_password" /></label>
          <label className="ns-field"><span>Confirm New Password</span><PasswordField name="confirm_new_password" /></label>
        </div>
        {err && <p className="ns-field-error">{err}</p>}
        <button className="btn btn--sm btn--solid" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Update Password'}</button>
      </form>
    </article>
  )
}

/** Reusable split-address inputs (Street / Floor / City / State / ZIP / Country). */
function AddressFields({ errs, title = 'Home Address' }: { errs: FieldErrors; title?: string }) {
  return (
    <>
      <div className="ns-form__subhead">{title}</div>
      <label className="ns-field ns-field--full"><span>Street Name</span><input name="addr_street" /><FieldError msg={errs.addr_street} /></label>
      <label className="ns-field"><span>Floor / Apt <span className="ns-field-hint">(optional)</span></span><input name="addr_floor" /></label>
      <label className="ns-field"><span>City</span><input name="addr_city" /><FieldError msg={errs.addr_city} /></label>
      <label className="ns-field"><span>State / Province</span><input name="addr_state" /><FieldError msg={errs.addr_state} /></label>
      <label className="ns-field"><span>ZIP / Postal Code</span><input name="addr_zip" inputMode="numeric" maxLength={10} /><FieldError msg={errs.addr_zip} /></label>
      <label className="ns-field"><span>Country</span><input name="addr_country" defaultValue="United States" /><FieldError msg={errs.addr_country} /></label>
    </>
  )
}

const TABLE_PAGE_SIZE = 10

function pagerNumbers(page: number, pages: number): Array<number | 'gap'> {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i)
  const out: Array<number | 'gap'> = [0]
  const start = Math.max(1, page - 1)
  const end = Math.min(pages - 2, page + 1)
  if (start > 1) out.push('gap')
  for (let i = start; i <= end; i++) out.push(i)
  if (end < pages - 2) out.push('gap')
  out.push(pages - 1)
  return out
}

function NsPager({ page, pages, total, size, onPage }: { page: number; pages: number; total: number; size: number; onPage: (p: number) => void }) {
  const from = page * size + 1
  const to = Math.min(total, page * size + size)
  return (
    <div className="ns-pager">
      <span className="ns-pager__info">Showing {from}&ndash;{to} of {total}</span>
      <div className="ns-pager__controls">
        <button type="button" className="ns-pager__btn" disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Previous page">‹</button>
        {pagerNumbers(page, pages).map((n, i) => (
          n === 'gap'
            ? <span key={`gap-${i}`} className="ns-pager__gap" aria-hidden="true">…</span>
            : <button key={n} type="button" className={`ns-pager__num ${n === page ? 'is-active' : ''}`} aria-current={n === page} onClick={() => onPage(n)}>{n + 1}</button>
        ))}
        <button type="button" className="ns-pager__btn" disabled={page >= pages - 1} onClick={() => onPage(page + 1)} aria-label="Next page">›</button>
      </div>
    </div>
  )
}

/* Render-prop wrapper: paginates any list to 10/page and renders a pager
   below the children when the list exceeds one page. Keeps its own page
   state so each table tracks its position independently. */
function PagedRows<T>({ items, size = TABLE_PAGE_SIZE, children }: { items: T[]; size?: number; children: (rows: T[]) => ReactNode }) {
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(items.length / size))
  const current = Math.min(page, pages - 1)
  const slice = items.slice(current * size, current * size + size)
  return (
    <>
      {children(slice)}
      {items.length > size && (
        <NsPager page={current} pages={pages} total={items.length} size={size} onPage={setPage} />
      )}
    </>
  )
}

// Day-over-day rank movement indicator (▲ green up / ▼ red down / — flat / NEW).
function SchoolRankMovement({ movement, previousRank }: { movement: number; previousRank: number | null }) {
  if (previousRank === null) {
    return <span className="ns-rank-move ns-rank-move--new" title="New on the board">NEW</span>
  }
  if (movement > 0) {
    return <span className="ns-rank-move ns-rank-move--up" title={`Up ${movement} place${movement > 1 ? 's' : ''} since yesterday`}><i aria-hidden="true">▲</i>{movement}</span>
  }
  if (movement < 0) {
    return <span className="ns-rank-move ns-rank-move--down" title={`Down ${Math.abs(movement)} place${Math.abs(movement) > 1 ? 's' : ''} since yesterday`}><i aria-hidden="true">▼</i>{Math.abs(movement)}</span>
  }
  return <span className="ns-rank-move ns-rank-move--flat" title="No change since yesterday">—</span>
}

// School leaderboard ranked by students joined — shown in every role's Rankings tab.
function SchoolRankBoard({ schools, mySchoolId, hidden }: { schools: any[]; mySchoolId?: number | null; hidden?: boolean }) {
  const max = Math.max(1, ...schools.map((s) => Number(s.student_count) || 0))
  return (
    <article className="glass ns-dash-card ns-dash-card--wide reveal in ns-leaderboard-card" hidden={hidden}>
      <div className="ns-dash-card__head">
        <span className="eyebrow">School Rankings</span>
        <span className="ns-board__badge">🏫 By students joined</span>
      </div>
      <p className="ns-leaderboard-tagline">
        Schools rise on the board as more students join. The arrow beside each rank shows the change since yesterday — recruit more students to climb higher.
      </p>
      {schools.length === 0 ? (
        <p className="ns-muted" style={{ marginTop: 16 }}>No schools ranked yet.</p>
      ) : (
        <div className="ns-leaderboard" role="list">
          <div className="ns-leaderboard__head ns-leaderboard__head--school" aria-hidden="true">
            <span>Rank</span>
            <span />
            <span>School</span>
            <span>Students</span>
          </div>
          {schools.map((s) => {
            const me = mySchoolId != null && Number(s.school_id) === Number(mySchoolId)
            const rank = Number(s.rank) || 0
            const pct = Math.max(6, Math.round(((Number(s.student_count) || 0) / max) * 100))
            return (
              <div
                key={s.school_id}
                role="listitem"
                className={`ns-leader-row ns-leader-row--school ${rank >= 1 && rank <= 3 ? 'is-podium' : ''} ${me ? 'is-me' : ''}`}
                data-rank={rank}
              >
                <span className="ns-leader-rank ns-leader-rank--move">
                  <b>{rank >= 1 && rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : rank}</b>
                  <SchoolRankMovement movement={Number(s.movement) || 0} previousRank={s.previous_rank ?? null} />
                </span>
                <span className="ns-leader-avatar" aria-hidden="true">{String(s.school_name || '?').trim().charAt(0).toUpperCase()}</span>
                <div className="ns-leader-id">
                  <strong>{s.school_name}{me ? ' (you)' : ''}</strong>
                  <span>{s.status}</span>
                </div>
                <div className="ns-leader-score">
                  <div className="ns-leader-bar"><span style={{ width: `${pct}%` }} /></div>
                  <strong>{s.student_count}<small>joined</small></strong>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </article>
  )
}

type RegistrationTag = 'community' | 'student' | 'parent' | 'school' | 'teacher' | 'business' | 'sponsor' | 'partner' | 'media' | 'volunteer'
type DashboardTabKey = 'overview' | 'profile' | 'activity' | 'rankings' | 'records' | 'approvals' | 'reviews' | 'notifications' | 'data' | 'chat' | 'faq'
type SchoolRecordsTabKey = 'students' | 'teachers' | 'interviews' | 'approvals' | 'projects'
type DashboardTabConfig = { key: DashboardTabKey; label: string; hint: string; badge?: string }

// ---- Records CRUD config (drives the view/edit/create modal) ----
type RecordEntity = 'student' | 'teacher' | 'interview' | 'approval' | 'submission'
type RecordFieldType = 'text' | 'email' | 'number' | 'date' | 'textarea' | 'select' | 'checkbox' | 'studentRef' | 'teacherRef'
type RecordField = {
  key: string
  label: string
  type: RecordFieldType
  options?: string[]
  required?: boolean
  createOnly?: boolean
  editOnly?: boolean
  full?: boolean
}
type RecordDef = { entity: RecordEntity; label: string; api: string; idKey: string; fields: RecordField[] }

const RECORDS_TAB_ENTITY: Record<SchoolRecordsTabKey, RecordEntity> = {
  students: 'student', teachers: 'teacher', interviews: 'interview', approvals: 'approval', projects: 'submission',
}

const RECORD_DEFS: Record<RecordEntity, RecordDef> = {
  student: {
    entity: 'student', label: 'Student', api: 'new-school/manage/student', idKey: 'id',
    fields: [
      { key: 'full_name', label: 'Full name', type: 'text', required: true, full: true },
      { key: 'email', label: 'Email', type: 'email', required: true, full: true },
      { key: 'age', label: 'Age', type: 'number' },
      { key: 'date_of_birth', label: 'Date of birth', type: 'date' },
      { key: 'grade_level', label: 'Grade', type: 'text' },
      { key: 'phone_number', label: 'Phone', type: 'text' },
      { key: 'home_address', label: 'Home address', type: 'text', full: true },
      { key: 'teacher_id', label: 'Teacher', type: 'teacherRef' },
      { key: 'parent_name', label: 'Parent name', type: 'text' },
      { key: 'parent_phone', label: 'Parent phone', type: 'text' },
      { key: 'parent_email', label: 'Parent email', type: 'email', full: true },
      { key: 'password', label: 'Password (optional)', type: 'text', createOnly: true, full: true },
      { key: 'parent_consent_status', label: 'Parent consent', type: 'select', options: ['pending', 'approved', 'rejected'], editOnly: true },
      { key: 'school_approval_status', label: 'School approval', type: 'select', options: ['pending', 'approved', 'rejected'], editOnly: true },
      { key: 'teacher_approval_status', label: 'Teacher approval', type: 'select', options: ['pending', 'approved', 'rejected'], editOnly: true },
      { key: 'submission_status', label: 'Submission', type: 'select', options: ['locked', 'eligible', 'submitted', 'complete'], editOnly: true },
    ],
  },
  teacher: {
    entity: 'teacher', label: 'Teacher', api: 'new-school/manage/teacher', idKey: 'id',
    fields: [
      { key: 'teacher_full_name', label: 'Full name', type: 'text', required: true, full: true },
      { key: 'school_email', label: 'Email', type: 'email', required: true, full: true },
      { key: 'phone_number', label: 'Phone', type: 'text' },
      { key: 'role_department', label: 'Department', type: 'text' },
      { key: 'grade_level_supported', label: 'Grades supported', type: 'text' },
      { key: 'password', label: 'Password (optional)', type: 'text', createOnly: true, full: true },
      { key: 'status', label: 'Status', type: 'select', options: ['registered', 'approved', 'rejected'], editOnly: true },
    ],
  },
  interview: {
    entity: 'interview', label: 'Interview', api: 'new-school/manage/interview', idKey: 'id',
    fields: [
      { key: 'student_id', label: 'Student', type: 'studentRef', required: true, createOnly: true, full: true },
      { key: 'visit_number', label: 'Visit #', type: 'number' },
      { key: 'business_name', label: 'Business', type: 'text', required: true },
      { key: 'business_category', label: 'Category', type: 'text' },
      { key: 'owner_name', label: 'Owner', type: 'text' },
      { key: 'business_phone', label: 'Business phone', type: 'text' },
      { key: 'business_address', label: 'Business address', type: 'text', full: true },
      { key: 'business_website', label: 'Business website', type: 'text' },
      { key: 'date_of_visit', label: 'Date of visit', type: 'date' },
      { key: 'main_challenge', label: 'Main challenge', type: 'textarea', full: true },
      { key: 'student_notes', label: 'Notes', type: 'textarea', full: true },
      { key: 'has_website', label: 'Has website', type: 'checkbox' },
      { key: 'has_google_profile', label: 'Google profile', type: 'checkbox' },
      { key: 'uses_social_media', label: 'Social media', type: 'checkbox' },
      { key: 'has_online_ordering', label: 'Online ordering', type: 'checkbox' },
      { key: 'has_delivery_options', label: 'Delivery', type: 'checkbox' },
    ],
  },
  approval: {
    entity: 'approval', label: 'Approval', api: 'new-school/manage/approval', idKey: 'id',
    fields: [
      { key: 'student_id', label: 'Student', type: 'studentRef', required: true, createOnly: true, full: true },
      { key: 'approval_type', label: 'Type', type: 'select', options: ['school', 'teacher'], required: true, createOnly: true },
      { key: 'status', label: 'Status', type: 'select', options: ['pending', 'approved', 'rejected'], required: true },
      { key: 'reviewer_name', label: 'Reviewer', type: 'text' },
      { key: 'digital_signature', label: 'Signature', type: 'text' },
      { key: 'notes', label: 'Notes', type: 'textarea', full: true },
    ],
  },
  submission: {
    entity: 'submission', label: 'Project', api: 'new-school/manage/submission', idKey: 'id',
    fields: [
      { key: 'student_id', label: 'Student', type: 'studentRef', required: true, createOnly: true, full: true },
      { key: 'status', label: 'Status', type: 'select', options: ['draft', 'submitted', 'approved', 'rejected', 'winner'] },
      { key: 'score', label: 'Score', type: 'number' },
      { key: 'rank_position', label: 'Rank', type: 'number' },
      { key: 'problem_identified', label: 'Problem', type: 'textarea', full: true },
      { key: 'why_it_matters', label: 'Why it matters', type: 'textarea', full: true },
      { key: 'proposed_solution', label: 'Solution', type: 'textarea', full: true },
      { key: 'how_it_helps', label: 'How it helps', type: 'textarea', full: true },
      { key: 'expected_impact', label: 'Expected impact', type: 'textarea', full: true },
      { key: 'video_url', label: 'Video URL', type: 'text', full: true },
      { key: 'written_url', label: 'Written URL', type: 'text', full: true },
    ],
  },
}


const participantCards = [
  {
    kicker: 'Open To',
    title: 'Students Ages 11-19',
    detail: 'Lead the interviews, identify a community problem, and build the final solution.',
  },
  {
    kicker: 'School Leaders',
    title: 'Principals & Schools',
    detail: 'Bring the challenge into the building, support participation, and compete for the school impact grant.',
  },
  {
    kicker: 'Support',
    title: 'Parents',
    detail: 'Give consent, support the student journey, and stay informed through the QR and dashboard flow.',
  },
  {
    kicker: 'Guide',
    title: 'Teachers',
    detail: 'Guide student work, review readiness, and help connect classroom learning to community impact.',
  },
  {
    kicker: 'Invest',
    title: 'Sponsors',
    detail: 'Fuel scholarships, school grants, and statewide visibility for the movement.',
  },
  {
    kicker: 'Partner',
    title: 'Community Partners',
    detail: 'Share real local business challenges and help students learn directly from the field.',
  },
]

const dashboardInfoCards = [
  {
    title: 'Student Dashboard',
    detail: 'Track interviews, approvals, rankings, final submission readiness, and scholarship progress in one place.',
  },
  {
    title: 'Parent Dashboard',
    detail: 'Monitor consent, student status, rankings, and program alerts without needing to manage the student workflow.',
  },
  {
    title: 'School Dashboard',
    detail: 'See school participation, approval progress, leaderboard position, and student readiness at the building level.',
  },
  {
    title: 'Teacher Dashboard',
    detail: 'Review assigned students, watch approval progress, and follow competition results tied to classroom participation.',
  },
]

const sponsorPillars = [
  {
    title: 'Scholarship Support',
    detail: 'Back student scholarships that reward problem-solving, leadership, and real-world impact.',
  },
  {
    title: 'School Impact',
    detail: 'Help schools compete for grant funding that strengthens student opportunity and community engagement.',
  },
  {
    title: 'Community Visibility',
    detail: 'Align your organization with an education-first movement built around schools, neighborhoods, and local businesses.',
  },
]

// ---- Flyer-aligned marketing content for the public landing redesign ----
const challengePillars = ['Building Future Entrepreneurs', 'Strengthening Communities', 'Creating Real Change']

const callingAudiences = [
  { title: 'Schools', detail: 'Bring the challenge into the building.' },
  { title: 'Educators', detail: 'Guide and mentor student teams.' },
  { title: 'Students', detail: 'Lead the work and the impact.' },
  { title: 'Parents', detail: 'Consent, support, and stay informed.' },
]

const schoolTypeChips = ['Public Schools', 'Private Schools', 'Charter Schools', 'Trade & Technical Schools']

const studentGains = [
  { title: 'Real-World Experience', detail: 'Interview local businesses and tackle real community problems.' },
  { title: 'Leadership Development', detail: 'Lead a team from problem to measurable solution.' },
  { title: 'Entrepreneurship Skills', detail: 'Think like a founder and build practical plans.' },
  { title: 'Scholarship Opportunities', detail: 'Compete for scholarships that reward impact.' },
  { title: 'Community Impact', detail: 'Leave your community better than you found it.' },
]

const coreValues = [
  { title: 'Educate', detail: 'Building Knowledge' },
  { title: 'Empower', detail: 'Inspiring Leaders' },
  { title: 'Engage', detail: 'Strengthening Communities' },
  { title: 'Elevate', detail: 'Creating A Better Tomorrow' },
]

const challengeFaqItems = [
  {
    question: "Who can participate?",
    answer: "Students ages 11-19 in grades 6-12 can join, with parent and school support where required.",
  },
  {
    question: "What do students do?",
    answer: "They interview local businesses, identify a real community problem, and build a solution that creates measurable impact.",
  },
  {
    question: "Do parents and schools need to approve?",
    answer: "Yes. The workflow is built around the correct approvals and consent steps before a student can move forward.",
  },
  {
    question: "What can students win?",
    answer: "Schools can earn impact grants, students can win scholarships, and outstanding educators can receive the educator award.",
  },
  {
    question: "How do I begin?",
    answer: "Choose the correct registration role at the top of the page, then follow the workflow through the dashboard.",
  },
] as const
interface JobOffer { id: number; business_name: string; category: string; message: string; student_consent: string; parent_consent: string; created_ts: number }

/* Internship/job offers surfaced on the student + parent dashboards. Self-fetches
   so it needs no changes to the dashboard data pipeline. Flow: admin approves →
   student accepts → parent consents → business is notified. */
function JobOffers({ role, hidden }: { role: 'student' | 'parent'; hidden?: boolean }) {
  const [offers, setOffers] = useState<JobOffer[]>([])
  const [busy, setBusy] = useState(0)
  useEffect(() => {
    let alive = true
    api.get<{ offers: JobOffer[] }>(`new-school/${role}/offers`).then((d) => { if (alive) setOffers(d.offers || []) }).catch(() => {})
    return () => { alive = false }
  }, [role])
  const respond = async (id: number, decision: 'accept' | 'decline') => {
    setBusy(id)
    try {
      const d = await api.post<{ offers: JobOffer[]; message?: string }>(`new-school/${role}/offer/${id}/respond`, { decision })
      setOffers(d.offers || [])
      window.fcToast?.(d.message || 'Saved.')
    } catch (e) { window.fcToast?.(e instanceof Error ? e.message : 'Could not save your response.') } finally { setBusy(0) }
  }
  if (offers.length === 0) return null
  const statusLine = (o: JobOffer): string => {
    if (role === 'student') {
      if (o.student_consent === 'declined') return 'You declined this offer.'
      if (o.student_consent === 'accepted') return o.parent_consent === 'accepted' ? 'Accepted — your parent/guardian has consented. The team will coordinate next steps.' : o.parent_consent === 'declined' ? 'Your parent/guardian declined consent.' : 'You accepted — waiting for your parent/guardian to consent.'
      return 'Respond below to accept or decline.'
    }
    if (o.parent_consent === 'accepted') return 'You consented. The business has been notified.'
    if (o.parent_consent === 'declined') return 'You declined consent.'
    return 'Your child accepted this offer — please give or decline consent.'
  }
  const canAct = (o: JobOffer) => role === 'student' ? o.student_consent === 'pending' : o.parent_consent === 'pending'
  return (
    <article className="glass ns-dash-card ns-dash-card--wide reveal in" hidden={hidden}>
      <div className="ns-dash-card__head">
        <span className="eyebrow">{role === 'student' ? '💼 Internship Offers' : '💼 Consent — Internship Offers'}</span>
        <span className="ns-board__badge">{offers.filter(canAct).length || ''}</span>
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        {offers.map((o) => (
          <div key={o.id} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px', background: 'rgba(0,0,0,0.14)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <strong style={{ color: 'var(--gold-light)' }}>{o.business_name}</strong>
              {o.category && <span style={{ color: 'var(--muted)', fontSize: 12 }}>{o.category}</span>}
            </div>
            {o.message && <p style={{ color: '#d8d3c6', fontSize: 13.5, lineHeight: 1.55, margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{o.message}</p>}
            <p style={{ color: 'var(--muted)', fontSize: 12.5, margin: '8px 0 0' }}>{statusLine(o)}</p>
            {canAct(o) && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button className="btn btn--sm btn--solid" disabled={busy === o.id} onClick={() => respond(o.id, 'accept')}>{busy === o.id ? '…' : role === 'student' ? 'Accept offer' : 'Give consent'}</button>
                <button className="btn btn--sm" disabled={busy === o.id} onClick={() => respond(o.id, 'decline')}>Decline</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </article>
  )
}

const dashboardTabsByRole: Record<string, DashboardTabConfig[]> = {
  student: [
    { key: 'overview', label: 'Overview', hint: 'Your progress at a glance' },
    { key: 'profile', label: 'My Profile', hint: 'Your details and approvals' },
    { key: 'activity', label: 'My Work', hint: 'Do your tasks and submit' },
    { key: 'rankings', label: 'Rankings', hint: 'See who is leading' },
    { key: 'chat', label: 'Chat', hint: 'Talk to the team' },
    { key: 'faq', label: 'Help', hint: 'Questions and answers' },
    { key: 'notifications', label: 'Alerts', hint: 'Your new updates' },
  ],
  parent: [
    { key: 'overview', label: 'Overview', hint: 'Your child at a glance' },
    { key: 'profile', label: 'My Profile', hint: 'Details for your child' },
    { key: 'rankings', label: 'Rankings', hint: 'See who is leading' },
    { key: 'chat', label: 'Chat', hint: 'Talk to the team' },
    { key: 'faq', label: 'Help', hint: 'Questions and answers' },
    { key: 'notifications', label: 'Alerts', hint: 'Your new updates' },
  ],
  school: [
    { key: 'overview', label: 'Overview', hint: 'Your school at a glance' },
    { key: 'profile', label: 'My Profile', hint: 'Your school details' },
    { key: 'approvals', label: 'Approvals', hint: 'Approve teachers and students' },
    { key: 'rankings', label: 'Rankings', hint: 'See who is leading' },
    { key: 'records', label: 'Records', hint: 'Students and their work' },
    { key: 'chat', label: 'Chat', hint: 'Talk to the team' },
    { key: 'faq', label: 'Help', hint: 'Questions and answers' },
    { key: 'notifications', label: 'Alerts', hint: 'Your new updates' },
  ],
  teacher: [
    { key: 'overview', label: 'Overview', hint: 'Your class at a glance' },
    { key: 'profile', label: 'My Profile', hint: 'Your details' },
    { key: 'approvals', label: 'Approvals', hint: 'Approve your students' },
    { key: 'rankings', label: 'Rankings', hint: 'See who is leading' },
    { key: 'records', label: 'Records', hint: 'Students and their work' },
    { key: 'chat', label: 'Chat', hint: 'Talk to the team' },
    { key: 'faq', label: 'Help', hint: 'Questions and answers' },
    { key: 'notifications', label: 'Alerts', hint: 'Your new updates' },
  ],
  admin: [
    { key: 'overview', label: 'Overview', hint: 'Everything at a glance' },
    { key: 'profile', label: 'My Profile', hint: 'Your details' },
    { key: 'data', label: 'People', hint: 'All people and records' },
    { key: 'reviews', label: 'Reviews', hint: 'Approve or decline work' },
    { key: 'rankings', label: 'Rankings', hint: 'See who is leading' },
    { key: 'notifications', label: 'Alerts', hint: 'Your new updates' },
  ],
}

// Record fields hidden from teacher & school in the records detail modal (data isolation:
// project/interview CONTENT is admin-only). Mirrors the server-side redaction allowlists.
const NS_CONTENT_FIELD_KEYS = new Set<string>([
  'owner_name', 'business_phone', 'business_address', 'main_challenge', 'student_notes',
  'has_website', 'has_google_profile', 'uses_social_media', 'uses_digital_signage',
  'offers_rewards', 'has_online_ordering', 'has_delivery_options',
  'problem_identified', 'why_it_matters', 'proposed_solution', 'how_it_helps',
  'expected_impact', 'video_url', 'written_url', 'reviewer_notes',
])
// Student PII keys additionally hidden from the teacher (school keeps roster PII).
const NS_PII_FIELD_KEYS = new Set<string>([
  'email', 'phone_number', 'home_address', 'parent_name', 'parent_phone', 'parent_email',
  'age', 'date_of_birth',
])

const movementSteps = [
  {
    badge: '①',
    title: 'Register',
    detail: 'Create the student, parent, school, or teacher profile to get started.',
  },
  {
    badge: '②',
    title: 'Interview 10 Local Businesses',
    detail: 'Collect real feedback from the community and document each visit.',
  },
  {
    badge: '③',
    title: 'Identify A Community Problem',
    detail: 'Turn interview notes into a clear problem statement worth solving.',
  },
  {
    badge: '④',
    title: 'Develop A Solution',
    detail: 'Build a practical plan that can make a measurable difference.',
  },
  {
    badge: '⑤',
    title: 'Submit Your Project',
    detail: 'Upload the final video and written summary for review.',
  },
  {
    badge: '⑥',
    title: 'Compete For Scholarships & School Grants',
    detail: 'Enter the judging stage for awards and recognition.',
  },
]

export default function NewSchool() {
  const { token } = useParams()
  const location = useLocation()
  const { user, loading, refresh } = useAuth()
  const isDashboardRoute = location.pathname.startsWith('/new-school/dashboard')
  const [overview, setOverview] = useState<any>(null)
  const [overviewSyncedAt, setOverviewSyncedAt] = useState<number | null>(null)
  const [dashboard, setDashboard] = useState<any>(null)
  const [adminSummary, setAdminSummary] = useState<any>(null)
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [dashboardTab, setDashboardTab] = useState<DashboardTabKey>('overview')
  const [guideOpen, setGuideOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState<any[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const [parentLink, setParentLink] = useState<any>(null)
  const [busy, setBusy] = useState('')
  const [registrationTag, setRegistrationTag] = useState<RegistrationTag>('student')
  // Terms & Conditions agreement state (per registration form + content-upload forms).
  const [studentTermsOk, setStudentTermsOk] = useState(false)
  const [studentTermsSig, setStudentTermsSig] = useState('')
  const [studentDob, setStudentDob] = useState('')
  const [parentTermsOk, setParentTermsOk] = useState(false)
  const [schoolTermsOk, setSchoolTermsOk] = useState(false)
  const [schoolTermsSig, setSchoolTermsSig] = useState('')
  const [teacherTermsOk, setTeacherTermsOk] = useState(false)
  const [teacherTermsSig, setTeacherTermsSig] = useState('')
  const [businessTermsOk, setBusinessTermsOk] = useState(false)
  const [submissionTermsOk, setSubmissionTermsOk] = useState(false)
  const [scholarshipBusy, setScholarshipBusy] = useState(false)
  const [recordDetail, setRecordDetail] = useState<{ kind: 'interview' | 'project'; record: any } | null>(null)
  const [notice, setNotice] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [studentSchoolSearch, setStudentSchoolSearch] = useState('')
  const [studentTeacherId, setStudentTeacherId] = useState('')
  // "Register under TrendCatch EDU" intake — used when the school isn't listed yet.
  const [studentEduMode, setStudentEduMode] = useState(false)
  const [teacherEduMode, setTeacherEduMode] = useState(false)
  const [teacherSchoolSearch, setTeacherSchoolSearch] = useState('')
  const [parentSchoolSearch, setParentSchoolSearch] = useState('')
  const [parentTeacherId, setParentTeacherId] = useState('')
  const [parentParticipantId, setParentParticipantId] = useState('')
  // Parent must verify the student's unique ID before consent can be submitted.
  const [parentVerify, setParentVerify] = useState<{ status: 'idle' | 'checking' | 'ok' | 'fail'; name: string }>({ status: 'idle', name: '' })
  // Inline (below-field) validation errors per registration form.
  const [studentErr, setStudentErr] = useState<FieldErrors>({})
  const [parentErr, setParentErr] = useState<FieldErrors>({})
  const [schoolErr, setSchoolErr] = useState<FieldErrors>({})
  const [teacherErr, setTeacherErr] = useState<FieldErrors>({})
  const [schoolApprovalsTab, setSchoolApprovalsTab] = useState<'students' | 'teachers' | 'parents'>('students')
  const [schoolApprovalSearch, setSchoolApprovalSearch] = useState('')
  const [schoolApprovalStatus, setSchoolApprovalStatus] = useState('all')
  const [approvalDetail, setApprovalDetail] = useState<{ type: 'student' | 'teacher'; id: number } | null>(null)
  const [schoolRankingTab, setSchoolRankingTab] = useState<'students' | 'teachers'>('students')
  const [adminRankingTab, setAdminRankingTab] = useState<'students' | 'teachers'>('students')
  const [adminRankSchoolId, setAdminRankSchoolId] = useState('')
  const [studentRankTab, setStudentRankTab] = useState<'school' | 'class'>('school')
  const [resultsTab, setResultsTab] = useState<'students' | 'schools' | 'teachers'>('students')
  const [schoolRankings, setSchoolRankings] = useState<any[]>([])
  const [recordModal, setRecordModal] = useState<{ entity: RecordEntity; mode: 'view' | 'edit' | 'create'; id: number | null } | null>(null)
  const [recordForm, setRecordForm] = useState<Record<string, any>>({})
  const [recordBusy, setRecordBusy] = useState(false)
  const [schoolRecordsTab, setSchoolRecordsTab] = useState<SchoolRecordsTabKey>('students')
  const [schoolSubmissionReviewId, setSchoolSubmissionReviewId] = useState('')
  const [reviewForm, setReviewForm] = useState<{ status: string; score: string; rank_position: string; reviewer_notes: string }>({ status: 'approved', score: '', rank_position: '', reviewer_notes: '' })

  useSeo({
    title: isDashboardRoute ? 'New School Dashboard' : '1st Annual Student Impact Challenge',
    description: isDashboardRoute
      ? 'Private role dashboard for approved students, parents, schools, teachers, and admins.'
      : 'Leave It Better Than You Found It. Students interview local businesses, identify a community problem, build a solution, and compete for over $35,000 in scholarships, school grants, and recognition.',
    noindex: isDashboardRoute,
  })

  const accountApprovalStatus = (user?.approval_status || 'approved').toString()
  const hasApprovedChallengeAccess = !user || isAdminRole(user.role) || accountApprovalStatus === 'approved'
  const dashboardHref = user ? resolveDashboardRoute(user.role) : '/new-school?register=student#registration'

  const showNotice = (tone: 'success' | 'error' | 'info', text: string) => {
    setNotice({ tone, text })
    window.fcToast?.(text)
  }

  const handleError = (err: unknown, fallback: string) => {
    const message = err instanceof Error ? err.message : fallback
    showNotice('error', message)
  }

  const openRegistrationTag = (tag: RegistrationTag) => {
    setRegistrationTag(tag)
    window.requestAnimationFrame(() => {
      document.getElementById('registration')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const reloadOverview = async () => {
    const data = await api.get<any>('new-school/overview')
    setOverview(data)
    setOverviewSyncedAt(Date.now())
  }

  const reloadDashboard = async () => {
    if (!user) return
    setDashboardLoading(true)
    try {
      if (isAdminRole(user.role)) {
        const data = await api.get<any>('admin/new-school/summary')
        setAdminSummary(data)
        setDashboard(null)
        return
      }
      const data = await api.get<any>('new-school/dashboard')
      setDashboard(data)
      setAdminSummary(null)
    } finally {
      setDashboardLoading(false)
    }
  }

  // First-visit dashboard guide: auto-open once per account+role (per browser).
  const guideRoleNow = () => (adminSummary ? 'admin' : (dashboard?.role || ''))
  useEffect(() => {
    if (!isDashboardRoute || !user) return
    const role = guideRoleNow()
    if (!role) return
    try {
      if (!localStorage.getItem(`ns-guide-seen-${user.id}-${role}`)) setGuideOpen(true)
    } catch { /* localStorage unavailable */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDashboardRoute, user, dashboard, adminSummary])

  const closeGuide = () => {
    setGuideOpen(false)
    const role = guideRoleNow()
    try {
      if (user && role) localStorage.setItem(`ns-guide-seen-${user.id}-${role}`, '1')
    } catch { /* ignore */ }
  }

  // ---- Admin ⇄ user chat (user side) ----
  const loadChat = async () => {
    try {
      const d = await api.get<any>('new-school/chat')
      setChatMessages(Array.isArray(d?.messages) ? d.messages : [])
    } catch {
      setChatMessages([])
    }
  }
  const sendChat = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const text = chatInput.trim()
    if (!text || chatBusy) return
    setChatBusy(true)
    try {
      const d = await api.post<any>('new-school/chat', { body: text })
      setChatMessages(Array.isArray(d?.messages) ? d.messages : [])
      setChatInput('')
    } catch (err) {
      handleError(err, 'Could not send your message.')
    } finally {
      setChatBusy(false)
    }
  }
  const clearChatForMe = async () => {
    if (!confirm('Clear this chat from your view? The admin team keeps the full history.')) return
    setChatBusy(true)
    try {
      await api.post('new-school/chat/clear', {})
      setChatMessages([])
    } catch (err) {
      handleError(err, 'Could not clear the chat.')
    } finally {
      setChatBusy(false)
    }
  }
  useEffect(() => {
    if (isDashboardRoute && user && dashboardTab === 'chat') void loadChat()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardTab, isDashboardRoute, user])

  const reloadParentLink = async (qrToken: string) => {
    const data = await api.get<any>(`new-school/parent/${qrToken}`)
    setParentLink(data)
    setParentParticipantId(data?.student?.participant_id || '')
    setParentSchoolSearch(data?.school?.school_name || '')
    setParentTeacherId(data?.teacher?.id ? String(data.teacher.id) : '')
    // Opened via QR → the student is already confirmed, so mark it verified.
    if (data?.student?.full_name) setParentVerify({ status: 'ok', name: data.student.full_name })
  }


  const markNotificationRead = async (notificationId: number) => {
    if (!notificationId) return
    setBusy(`notif-${notificationId}`)
    try {
      await api.post<any>(`new-school/notifications/${notificationId}/read`, {})
      await reloadDashboard()
    } catch (err) {
      handleError(err, 'Could not update the notification.')
    } finally {
      setBusy('')
    }
  }

  useEffect(() => {
    if (isDashboardRoute) {
      setOverview(null)
      return
    }

    let alive = true
    let inFlight = false
    const syncOverview = async () => {
      if (!alive || inFlight) return
      inFlight = true
      try {
        await reloadOverview()
      } catch (err) {
        handleError(err, 'Could not load challenge overview.')
      } finally {
        inFlight = false
      }
    }

    void syncOverview()
    const interval = window.setInterval(() => {
      void syncOverview()
    }, 30000)

    return () => {
      alive = false
      window.clearInterval(interval)
    }
  }, [isDashboardRoute])

  useEffect(() => {
    if (loading) return
    if (!isDashboardRoute) {
      setDashboard(null)
      setAdminSummary(null)
      return
    }
    if (user) {
      if (hasApprovedChallengeAccess) {
        reloadDashboard().catch((err) => handleError(err, 'Could not load dashboard data.'))
        api.get<any>('new-school/school-rankings')
          .then((data) => setSchoolRankings(Array.isArray(data?.schools) ? data.schools : []))
          .catch(() => setSchoolRankings([]))
      } else {
        setDashboard(null)
        setAdminSummary(null)
      }
    } else {
      setDashboard(null)
      setAdminSummary(null)
    }
  }, [user, loading, hasApprovedChallengeAccess, isDashboardRoute])

  useEffect(() => {
    if (!token) {
      setParentLink(null)
      setParentParticipantId('')
      setParentSchoolSearch('')
      setParentTeacherId('')
      return
    }
    setRegistrationTag('parent')
    reloadParentLink(token).catch((err) => handleError(err, 'Could not load the QR consent record.'))
  }, [token])

  useEffect(() => {
    if (token) {
      document.getElementById('parent-consent')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [token, parentLink])

  // Deep-link from the marketing pages: /new-school?register=school preselects that
  // role's tab and scrolls to the registration section (the forms are hidden otherwise).
  useEffect(() => {
    if (isDashboardRoute) return
    const requested = new URLSearchParams(location.search).get('register')
    const valid: RegistrationTag[] = ['student', 'parent', 'school', 'teacher']
    if (requested && (valid as string[]).includes(requested)) {
      setRegistrationTag(requested as RegistrationTag)
      window.requestAnimationFrame(() => {
        document.getElementById('registration')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
  }, [location.search, isDashboardRoute])

  useEffect(() => {
    if (!isDashboardRoute) return
    const frame = window.requestAnimationFrame(() => {
      document.getElementById('dashboard')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [isDashboardRoute, loading, user])


  const saveScholarship = async (answers: ScholarshipAnswer[]) => {
    setScholarshipBusy(true)
    try {
      const res = await api.post<any>('new-school/scholarship', { answers })
      showNotice('success', res.message || 'Scholarship answers saved.')
      await reloadDashboard()
    } catch (err) {
      handleError(err, 'Could not save your answers.')
    } finally {
      setScholarshipBusy(false)
    }
  }

  const submitBusiness = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy('business')
    try {
      const form = event.currentTarget
      const fd = new FormData(form)
      // Short fields: at least 3 characters (a single letter is never valid).
      assertMinChars(value(fd, 'business_name'), 'Business name', 3)
      assertMinChars(value(fd, 'owner_name'), 'Owner / Manager', 3)
      assertMinChars(value(fd, 'business_address'), 'Business address', 3)
      assertMinChars(value(fd, 'business_category'), 'Category', 3)
      if (value(fd, 'business_phone').replace(/\D/g, '').length < 7) throw new Error('Phone number must be at least 7 digits.')
      // Date of visit: from your registration date up to today.
      const dateOfVisit = value(fd, 'date_of_visit')
      const regDate = String(studentDashboard?.student?.created_at || '').slice(0, 10)
      if (!dateOfVisit) throw new Error('Date of visit is required.')
      if (regDate && dateOfVisit < regDate) throw new Error('Date of visit can’t be before you registered.')
      if (dateOfVisit > todayInputDate()) throw new Error('Date of visit can’t be in the future.')
      // Long answers: 50–500 words.
      assertWordRange(value(fd, 'main_challenge'), 'Main challenge')
      assertWordRange(value(fd, 'student_notes'), 'Student notes')
      const payload = {
        student_id: Number(value(fd, 'student_id') || dashboard?.student?.id || parentLink?.student?.id || 0) || undefined,
        visit_number: Number(value(fd, 'visit_number') || 0) || undefined,
        business_name: value(fd, 'business_name'),
        owner_name: value(fd, 'owner_name'),
        business_phone: value(fd, 'business_phone'),
        business_address: value(fd, 'business_address'),
        business_category: value(fd, 'business_category'),
        business_website: value(fd, 'business_website'),
        date_of_visit: value(fd, 'date_of_visit'),
        has_website: checked(fd, 'has_website'),
        has_google_profile: checked(fd, 'has_google_profile'),
        uses_social_media: checked(fd, 'uses_social_media'),
        uses_digital_signage: checked(fd, 'uses_digital_signage'),
        offers_rewards: checked(fd, 'offers_rewards'),
        has_online_ordering: checked(fd, 'has_online_ordering'),
        has_delivery_options: checked(fd, 'has_delivery_options'),
        main_challenge: value(fd, 'main_challenge'),
        student_notes: value(fd, 'student_notes'),
        signature: value(fd, 'signature'),
      }
      const res = await api.post<any>('new-school/business', payload)
      showNotice('success', res.message || 'Business interview saved.')
      recordTermsAcceptance({ kind: 'website', signature: user?.full_name || value(fd, 'business_name'), email: user?.email || '', documentLabel: 'Business Interview Upload' })
      form.reset()
      await reloadDashboard()
      await reloadOverview()
    } catch (err) {
      handleError(err, 'Business interview could not be saved.')
    } finally {
      setBusy('')
    }
  }

  const submitSubmission = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    // One-time only: confirm before the single allowed submission.
    if (!window.confirm('Your final project can be submitted only ONCE and cannot be changed afterwards. Make sure everything is correct before you continue. Submit now?')) {
      return
    }
    setBusy('submission')
    try {
      const form = event.currentTarget
      const fd = new FormData(form)
      // Long answers: 50–500 words each.
      assertWordRange(value(fd, 'problem_identified'), 'Problem identified')
      assertWordRange(value(fd, 'why_it_matters'), 'Why it matters')
      assertWordRange(value(fd, 'proposed_solution'), 'Proposed solution')
      assertWordRange(value(fd, 'how_it_helps'), 'How it helps')
      assertWordRange(value(fd, 'expected_impact'), 'Expected impact')
      // Upload rules: video ≤ 70 MB; image/PDF ≤ 5 MB.
      const videoFile = fileValue(fd, 'video_file')
      const writtenFile = fileValue(fd, 'written_file')
      if (videoFile) {
        if (!videoFile.type.startsWith('video/')) throw new Error('The first upload must be a video file.')
        if (videoFile.size > MAX_VIDEO_BYTES) throw new Error('Video must be 70 MB or smaller.')
      }
      if (writtenFile) {
        const okDoc = writtenFile.type.startsWith('image/') || writtenFile.type === 'application/pdf'
        if (!okDoc) throw new Error('The second upload must be an image or a PDF.')
        if (writtenFile.size > MAX_DOC_BYTES) throw new Error('The image / PDF must be 5 MB or smaller.')
      }
      const videoUrl = await uploadIfPresent(videoFile)
      const writtenUrl = await uploadIfPresent(writtenFile)
      // Optional bonus items (215-model): AI demonstration + community service.
      const aiFile = fileValue(fd, 'ai_file')
      const communityFile = fileValue(fd, 'community_file')
      const aiUrl = await uploadIfPresent(aiFile)
      const communityUrl = await uploadIfPresent(communityFile)
      const payload = {
        student_id: Number(value(fd, 'student_id') || dashboard?.student?.id || parentLink?.student?.id || 0) || undefined,
        source_business_id: Number(value(fd, 'source_business_id') || 0) || undefined,
        problem_identified: value(fd, 'problem_identified'),
        why_it_matters: value(fd, 'why_it_matters'),
        proposed_solution: value(fd, 'proposed_solution'),
        how_it_helps: value(fd, 'how_it_helps'),
        expected_impact: value(fd, 'expected_impact'),
        video_url: videoUrl,
        written_url: writtenUrl,
        ai_note: value(fd, 'ai_note'),
        ai_url: aiUrl,
        community_note: value(fd, 'community_note'),
        community_url: communityUrl,
      }
      const res = await api.post<any>('new-school/submission', payload)
      showNotice('success', res.message || 'Submission saved.')
      recordTermsAcceptance({ kind: 'website', signature: user?.full_name || 'Student', email: user?.email || '', documentLabel: 'Final Project Upload' })
      form.reset()
      await reloadDashboard()
      await reloadOverview()
    } catch (err) {
      handleError(err, 'Final submission failed.')
    } finally {
      setBusy('')
    }
  }

  // Inline per-item upload: student picks a file directly on that material row.
  const uploadMaterialType = async (materialType: string, file: File | null) => {
    if (!file) return
    setBusy(`material-${materialType}`)
    try {
      const okDoc = file.type.startsWith('image/') || file.type === 'application/pdf'
      if (!okDoc) throw new Error('Upload an image or a PDF.')
      if (file.size > MAX_DOC_BYTES) throw new Error('File must be 5 MB or smaller.')
      const fileUrl = await uploadIfPresent(file)
      const studentId = Number(dashboard?.student?.id || parentLink?.student?.id || 0) || undefined
      await api.post('new-school/materials', { student_id: studentId, material_type: materialType, file_url: fileUrl, original_name: file.name })
      showNotice('success', 'Supporting material saved.')
      await reloadDashboard()
    } catch (err) {
      handleError(err, 'Could not save the material.')
    } finally {
      setBusy('')
    }
  }

  const removeMaterial = async (id: number) => {
    setBusy(`material-${id}`)
    try {
      await api.del(`new-school/materials/${id}`)
      showNotice('success', 'Material removed.')
      await reloadDashboard()
    } catch (err) {
      handleError(err, 'Could not remove the material.')
    } finally {
      setBusy('')
    }
  }

  const approveStudentInline = async (student: any, status: 'approved' | 'pending' | 'rejected') => {
    setBusy(`student-${student.id}-${status}`)
    try {
      // One student gate only: principal AND teacher record the SAME "teacher" approval.
      // The teacher must use the dedicated teacher route (manage/approval is closed to
      // teachers, 403); the principal/admin record the same gate via manage/approval with
      // approval_type='teacher' (school-scoped + activates the student's login).
      const res = teacherDashboard
        ? await api.post<any>('new-school/teacher/approve', {
            student_id: Number(student.id) || undefined,
            teacher_name: user?.full_name || '',
            teacher_email: user?.email || teacherDashboard?.teacher?.school_email || '',
            role: teacherDashboard?.teacher?.role_department || 'Teacher',
            approval_status: status,
            digital_signature: user?.full_name || '',
          })
        : await api.post<any>('new-school/manage/approval', {
            student_id: Number(student.id) || undefined,
            approval_type: 'teacher',
            status,
            reviewer_name: user?.full_name || '',
            digital_signature: user?.full_name || '',
          })
      showNotice('success', res.message || `${student.full_name} marked ${status}.`)
      await reloadDashboard()
      await reloadOverview()
    } catch (err) {
      handleError(err, 'Approval failed.')
    } finally {
      setBusy('')
    }
  }


  const approveTeacherInline = async (teacher: any, status: 'approved' | 'pending' | 'rejected') => {
    setBusy(`teacher-${teacher.id}-${status}`)
    try {
      const res = await api.post<any>('new-school/school/teacher/approve', {
        teacher_id: Number(teacher.id),
        teacher_name: teacher.teacher_full_name,
        teacher_email: teacher.school_email,
        role: teacher.role_department || 'Teacher',
        approval_status: status,
        digital_signature: user?.full_name || schoolDashboard?.school?.principal_name || 'School Administrator',
      })
      showNotice('success', res.message || `${teacher.teacher_full_name} marked ${status}.`)
      await reloadDashboard()
      await reloadOverview()
    } catch (err) {
      handleError(err, 'Teacher verification failed.')
    } finally {
      setBusy('')
    }
  }

  // Teacher approves/rejects a parent who has been confirmed by the student.
  const approveParentInline = async (parentRow: any, status: 'approved' | 'rejected') => {
    setBusy(`parent-${parentRow.student_id}-${status}`)
    try {
      const res = await api.post<any>('new-school/parent/approve', {
        student_id: Number(parentRow.student_id),
        approval_status: status,
      })
      showNotice('success', res.message || `Parent ${status}.`)
      await reloadDashboard()
      await reloadOverview()
    } catch (err) {
      handleError(err, 'Parent approval failed.')
    } finally {
      setBusy('')
    }
  }

  // Student confirms (or rejects) the parent who registered with their code.
  const confirmParent = async (decision: 'confirm' | 'reject') => {
    setBusy(`parent-confirm-${decision}`)
    try {
      const res = await api.post<any>('new-school/parent/confirm', { decision })
      showNotice('success', res.message || 'Saved.')
      await reloadDashboard()
      await reloadOverview()
    } catch (err) {
      handleError(err, 'Could not update the parent link.')
    } finally {
      setBusy('')
    }
  }

  const submitSubmissionReview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy('submission-review')
    try {
      const form = event.currentTarget
      const fd = new FormData(form)
      const submissionId = Number(value(fd, 'submission_id') || 0)
      if (!submissionId) {
        throw new Error('Select a submission to review.')
      }
      const payload = {
        submission_id: submissionId,
        status: value(fd, 'status') || 'approved',
        reviewer_notes: value(fd, 'reviewer_notes'),
        score: value(fd, 'score'),
        rank_position: Number(value(fd, 'rank_position') || 0) || undefined,
      }
      const res = await api.post<any>('new-school/submission/review', payload)
      showNotice('success', res.message || 'Submission review saved.')
      form.reset()
      await reloadDashboard()
      await reloadOverview()
    } catch (err) {
      handleError(err, 'Could not update the submission review.')
    } finally {
      setBusy('')
    }
  }

  const loadSubmissionReview = (row: any) => {
    if (!row) return
    setSchoolSubmissionReviewId(String(row.id))
    setReviewForm({
      status: String(row.status || '').toLowerCase() === 'rejected' ? 'rejected' : 'approved',
      score: row.score !== null && row.score !== undefined ? String(row.score) : '',
      rank_position: row.rank_position !== null && row.rank_position !== undefined ? String(row.rank_position) : '',
      reviewer_notes: row.reviewer_notes || '',
    })
    showNotice('info', `Loaded submission #${row.id} — ${row.student_name || 'student'}.`)
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => document.getElementById('ns-review-form')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
    }
  }

  const submitAdminReview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy('admin-review')
    try {
      const form = event.currentTarget
      const fd = new FormData(form)
      const submissionId = Number(value(fd, 'submission_id') || 0)
      if (!submissionId) {
        throw new Error('Select a submission to review.')
      }
      const status = value(fd, 'status') || 'submitted'
      const payload = {
        status,
        score: value(fd, 'score'),
        rank_position: Number(value(fd, 'rank_position') || 0) || undefined,
        place: value(fd, 'place'),
        scholarship_amount: Number(value(fd, 'scholarship_amount') || 0) || undefined,
        reviewer_notes: value(fd, 'reviewer_notes'),
      }
      const res = await api.put<any>(`admin/new-school/submission/${submissionId}`, payload)
      // On approval, award the bonus points (student up to 15, teacher up to 8, default 3).
      if (status === 'approved' || status === 'winner') {
        const teacherRaw = value(fd, 'teacher_award_points')
        await api.post('admin/new-school/points', {
          source_type: 'project',
          source_id: submissionId,
          student_points: Number(value(fd, 'student_award_points') || 0),
          teacher_points: teacherRaw === '' ? 3 : Number(teacherRaw || 0),
        })
      }
      showNotice('success', res.message || 'Submission updated.')
      form.reset()
      await reloadDashboard()
      await reloadOverview()
    } catch (err) {
      handleError(err, 'Could not update submission.')
    } finally {
      setBusy('')
    }
  }

  const submitInterviewPoints = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy('interview-points')
    try {
      const form = event.currentTarget
      const fd = new FormData(form)
      const interviewId = Number(value(fd, 'interview_id') || 0)
      if (!interviewId) {
        throw new Error('Select an interview to award points.')
      }
      const teacherRaw = value(fd, 'teacher_award_points')
      await api.post('admin/new-school/points', {
        source_type: 'interview',
        source_id: interviewId,
        student_points: Number(value(fd, 'student_award_points') || 0),
        teacher_points: teacherRaw === '' ? 3 : Number(teacherRaw || 0),
      })
      showNotice('success', 'Interview points awarded.')
      form.reset()
      await reloadDashboard()
      await reloadOverview()
    } catch (err) {
      handleError(err, 'Could not award interview points.')
    } finally {
      setBusy('')
    }
  }

  const exportCsv = async (type: string) => {
    setBusy(`export-${type}`)
    try {
      const data = await api.get<any>(`admin/new-school/export?type=${encodeURIComponent(type)}`)
      const blob = new Blob([data.csv || ''], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = data.filename || `new-school-${type}.csv`
      a.click()
      URL.revokeObjectURL(url)
      showNotice('success', `${type} export downloaded.`)
    } catch (err) {
      handleError(err, 'Could not export CSV.')
    } finally {
      setBusy('')
    }
  }

  const publishWinners = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy('publish')
    try {
      const form = event.currentTarget
      const fd = new FormData(form)
      const winners = [1, 2, 3]
        .map((slot) => ({
          submission_id: Number(value(fd, `winner_${slot}_submission_id`) || 0),
          place: value(fd, `winner_${slot}_place`),
          scholarship_amount: Number(value(fd, `winner_${slot}_amount`) || 0),
          rank_position: slot,
        }))
        .filter((row) => row.submission_id > 0 && row.place && row.scholarship_amount > 0)

      const res = await api.post<any>('admin/new-school/winners/publish', { winners })
      showNotice('success', res.message || 'Winners published.')
      form.reset()
      await reloadDashboard()
      await reloadOverview()
    } catch (err) {
      handleError(err, 'Could not publish winners.')
    } finally {
      setBusy('')
    }
  }

  const summary = overview?.summary || {}
  const schools = Array.isArray(overview?.schools) ? overview.schools : []
  const teachers = Array.isArray(overview?.teachers) ? overview.teachers : []
  const winners = Array.isArray(overview?.winners) ? overview.winners : []
  const challenge = overview?.challenge || {}
  const leaderboards = overview?.leaderboards || {}
  const leaderboardSchools = asArray<any>(leaderboards.schools)
  const leaderboardTeachers = asArray<any>(leaderboards.teachers)
  const leaderboardStudents = asArray<any>(leaderboards.students)
  // Public ranked leaderboards (top 10) for the Results section — one unified row shape
  // { id, rank, name, sub, right } so students / schools / teachers all render identically.
  type BoardRow = { id: number; rank: number; name: string; sub: string; right: string }
  const publicLeaderRows: BoardRow[] = leaderboardStudents
    .map((r: any) => ({
      id: Number(r.id),
      rank: Number(r.rank_position) || 0,
      name: r.label || r.full_name || 'Student',
      sub: r.school_name || '—',
      right: `${Number(r.final_score ?? r.student_points) || 0} pts`,
    }))
    .sort((a, b) => (a.rank || 999) - (b.rank || 999))
  const publicSchoolRows: BoardRow[] = leaderboardSchools.map((r: any, i: number) => ({
    id: Number(r.id) || i, rank: i + 1, name: r.label || 'School',
    sub: `${r.principal_name ? `${r.principal_name} · ` : ''}${Number(r.students) || 0} students`,
    right: `${Number(r.submissions) || 0} subs`,
  }))
  const publicTeacherRows: BoardRow[] = leaderboardTeachers.map((r: any, i: number) => ({
    id: Number(r.id) || i, rank: i + 1, name: r.label || 'Teacher',
    sub: r.school_name || '—',
    right: `${Number(r.students) || 0} students`,
  }))
  const boardRows = resultsTab === 'students' ? publicLeaderRows : resultsTab === 'schools' ? publicSchoolRows : publicTeacherRows
  const boardPodium = boardRows.length >= 3
    ? [2, 1, 3].map((rk) => boardRows.find((r) => r.rank === rk)).filter(Boolean) as BoardRow[]
    : boardRows.slice(0, 3)
  const latestWinner = winners[0] || null
  const topSchool = leaderboardSchools[0] || schools[0] || null
  const topTeacher = leaderboardTeachers[0] || teachers[0] || null
  const topStudent = leaderboardStudents[0] || null
  const liveSchools = firstPositive(summary.schools, schools.length, leaderboardSchools.length)
  const liveTeachers = firstPositive(summary.teachers, teachers.length, leaderboardTeachers.length)
  const liveStudents = firstPositive(summary.students, leaderboardStudents.length)
  const liveSubmissions = firstPositive(summary.submissions, topSchool?.submissions, topTeacher?.submissions, winners.length)
  const liveWinners = firstPositive(summary.winners, winners.length)
  const deadlineLabel = formatDateLabel(challenge.deadline)
  const registrationOpenLabel = formatLongDateLabel(challenge.registration_open || '2026-06-27')
  const winnersAnnouncedLabel = formatLongDateLabel(challenge.winners_announced || '2026-12-21')
  const deadlineDate = challenge.deadline ? new Date(challenge.deadline) : null
  const deadlineDays = deadlineDate && !Number.isNaN(deadlineDate.getTime())
    ? Math.max(0, Math.ceil((deadlineDate.getTime() - Date.now()) / 86400000))
    : null
  const scholarshipsAwarded = winners.reduce((total: number, winner: any) => total + Number(winner.scholarship_amount || 0), 0)
  const challengeProgressPercent = getChallengeProgressPercent(challenge, liveStudents, liveSubmissions)
  const movementStats: Array<{ label: string; value: string | number }> = [
    { label: 'Schools Registered', value: liveSchools },
    { label: 'Students Registered', value: liveStudents },
    { label: 'Teachers Joined', value: liveTeachers },
    // Each final submission represents one community problem identified and solved.
    { label: 'Community Problems Identified', value: liveSubmissions },
    { label: 'Scholarships Awarded', value: formatMoney(scholarshipsAwarded) },
  ]
  // ---- Flyer-aligned derived content for the redesigned landing ----
  const grantAmount = Number(challenge.school_grant_amount ?? 25000)
  const scholarshipMax = Number(challenge.student_scholarship_max_amount ?? 10000)
  const educatorAwardLabel = String(challenge.educator_award_label || 'All-Inclusive Educator Vacation Award')
  const ageRange = String(challenge.age_range || '11-19')
  const gradeRange = String(challenge.grade_range || '6-12')
  const totalAwardsLabel = `${formatMoney(grantAmount + scholarshipMax)}+`
  const awardHighlights = [
    { amount: formatMoney(grantAmount), label: 'School Impact Grant', detail: 'Fueling student-led solutions and lasting community impact.' },
    { amount: `Up to ${formatMoney(scholarshipMax)}`, label: 'Student Scholarships', detail: 'Investing in the next generation of leaders.' },
    { amount: educatorAwardLabel, label: 'Educator Award', detail: 'An all-inclusive vacation award for an outstanding educator.' },
  ]
  const timelineMilestones = (Array.isArray(challenge.timeline) && challenge.timeline.length)
    ? (challenge.timeline as Array<{ phase: string; when: string; highlight?: boolean }>)
    : [
        { phase: 'Registration Opens', when: registrationOpenLabel },
        { phase: 'Community Challenge Period', when: 'July – 23 November 2026' },
        { phase: 'Judging & Review', when: '24 November – 20 December 2026' },
        { phase: 'Winners Announced', when: winnersAnnouncedLabel, highlight: true },
        { phase: 'Award Ceremony', when: 'Early 2027' },
      ]
  const featuredAwards = awards.filter((a) => a.featured)
  const heroFacts = [
    `${formatMoney(grantAmount)} School Impact Grant`,
    `Up to ${formatMoney(scholarshipMax)} Student Scholarships`,
    educatorAwardLabel,
    `Ages ${ageRange}`,
    `Grades ${gradeRange}`,
    `Registration Opens: ${registrationOpenLabel}`,
    `Winners Announced: ${winnersAnnouncedLabel}`,
  ]
  const studentDashboard = dashboard?.role === 'student' ? dashboard : null
  const parentDashboard = dashboard?.role === 'parent' ? dashboard : null
  const schoolDashboard = dashboard?.role === 'school' ? dashboard : null
  const teacherDashboard = dashboard?.role === 'teacher' ? dashboard : null
  const adminDashboard = adminSummary || (dashboard?.role === 'admin' ? dashboard : null)
  const dashboardRole = adminDashboard ? 'admin' : studentDashboard ? 'student' : parentDashboard ? 'parent' : schoolDashboard ? 'school' : teacherDashboard ? 'teacher' : ''
  const selectedBusinessId = studentDashboard?.submission?.source_business_id || ''
  const canStudentSubmit = !!studentDashboard?.can_submit
  const teacherScore = teacherDashboard
    ? Math.round(
        (teacherDashboard.summary?.students_total || 0) * 5 +
          (teacherDashboard.summary?.parent_approved || 0) * 8 +
          (teacherDashboard.summary?.school_approved || 0) * 8 +
          (teacherDashboard.summary?.teacher_approved || 0) * 8 +
          (teacherDashboard.summary?.eligible_to_submit || 0) * 18 +
          (teacherDashboard.summary?.submitted || 0) * 28 +
          (teacherDashboard.summary?.interviews_total || 0) * 2,
      )
    : 0
  const teacherProgress = Math.min(100, Math.round(teacherScore / 8))
  const studentProgress = studentDashboard
    ? Math.round(Math.min(100, ((studentDashboard.interview_count || 0) / 10) * 100))
    : 0
  const studentStatusProgress = studentDashboard
    ? Math.round(((studentDashboard.status_tracker || []).filter((step: any) => step.complete).length / Math.max((studentDashboard.status_tracker || []).length, 1)) * 100)
    : 0
  const parentReadinessProgress = parentDashboard
    ? Math.round([
        parentDashboard.student_context?.student?.parent_consent_status,
        parentDashboard.student_context?.student?.school_approval_status,
        parentDashboard.student_context?.student?.teacher_approval_status,
        parentDashboard.student_context?.student?.submission_status,
      ].filter((status) => status && !['pending', 'locked', 'draft'].includes(String(status).toLowerCase())).length / 4 * 100)
    : 0
  const schoolReadinessProgress = schoolDashboard
    ? Math.round(Math.min(100, (((schoolDashboard.summary.teacher_approved || 0) + (schoolDashboard.summary.school_approved || 0) + (schoolDashboard.summary.parent_approved || 0)) / Math.max(Number(schoolDashboard.summary.students_total || 0), 1)) * 100))
    : 0
  const teacherReadinessProgress = teacherDashboard
    ? Math.round(Math.min(100, (((teacherDashboard.summary.teacher_approved || 0) + (teacherDashboard.summary.submitted || 0)) / Math.max(Number(teacherDashboard.summary.students_total || 0), 1)) * 100))
    : 0
  const adminReadinessProgress = adminDashboard
    ? Math.round(Math.min(100, (((adminDashboard.summary.submissions || 0) + (adminDashboard.summary.winners || 0)) / Math.max(Number(adminDashboard.summary.students || 0), 1)) * 100))
    : 0
  const currentSchoolEmail = schoolDashboard?.school?.administrator_email || user?.email || ''
  const currentTeacherEmail = teacherDashboard?.teacher?.school_email || user?.email || ''
  const studentNotifications = asArray<any>(studentDashboard?.notifications)
  const parentNotifications = asArray<any>(parentDashboard?.student_context?.notifications)
  const schoolNotifications = asArray<any>(schoolDashboard?.notifications)
  const teacherNotifications = asArray<any>(teacherDashboard?.notifications)
  const schoolBusinesses = asArray<any>(schoolDashboard?.businesses)
  const schoolSubmissions = asArray<any>(schoolDashboard?.submissions)
  const schoolApprovals = asArray<any>(schoolDashboard?.approvals)
  const schoolWinners = asArray<any>(schoolDashboard?.winners)
  const teacherBusinesses = asArray<any>(teacherDashboard?.businesses)
  const teacherSubmissions = asArray<any>(teacherDashboard?.submissions)
  const teacherApprovals = asArray<any>(teacherDashboard?.approvals)
  const teacherWinners = asArray<any>(teacherDashboard?.winners)
  const adminParents = asArray<any>(adminDashboard?.parents)
  const adminApprovals = asArray<any>(adminDashboard?.approvals)
  const adminBusinesses = asArray<any>(adminDashboard?.businesses)
  const adminNotifications = asArray<any>(adminDashboard?.notifications)
  const adminSchools = asArray<any>(adminDashboard?.schools)
  const adminStudentSummary = adminDashboard?.student_summary || {}
  // Admin Rankings: the same rich leaderboard the principal sees, but across every school
  // with a school filter (empty = all schools / global). Students & teachers carry a
  // GLOBAL rank_position, so the filtered set is re-indexed to keep the podium at #1/#2/#3.
  const adminStudents = asArray<any>(adminDashboard?.students)
  const adminTeachers = asArray<any>(adminDashboard?.teachers)
  const adminRankSchoolIdNum = adminRankSchoolId ? Number(adminRankSchoolId) : null
  const adminRankSchool = adminSchools.find((s: any) => String(s.id) === adminRankSchoolId) || null
  const adminRankStudentsScoped = adminRankSchoolIdNum
    ? adminStudents.filter((s: any) => Number(s.school_id) === adminRankSchoolIdNum)
    : adminStudents
  const adminRankTeachersScoped = adminRankSchoolIdNum
    ? adminTeachers.filter((t: any) => Number(t.school_id) === adminRankSchoolIdNum)
    : adminTeachers
  const adminLeaderRows = (adminRankingTab === 'students'
    ? adminRankStudentsScoped.slice()
        .sort((a: any, b: any) => (a.rank_position || 9999) - (b.rank_position || 9999))
        .map((r: any, i: number) => ({
          id: Number(r.id), type: 'student' as const, rank: i + 1,
          name: r.full_name, avatar: r.avatar_url, sub: r.school_name || (r.teacher_full_name ? `Mentor · ${r.teacher_full_name}` : '—'),
          score: Number(r.final_score ?? r.student_points) || 0, tag: r.submission_status || '—', tagType: 'status' as const,
        }))
    : adminRankTeachersScoped.slice()
        .sort((a: any, b: any) => (a.rank_position || 9999) - (b.rank_position || 9999))
        .map((r: any, i: number) => ({
          id: Number(r.id), type: 'teacher' as const, rank: i + 1,
          name: r.teacher_full_name, avatar: r.avatar_url, sub: r.linked_school_name || r.school_name || r.role_department || 'Faculty',
          score: Number(r.teacher_points) || 0, tag: `${r.students_total ?? 0} students`, tagType: 'count' as const,
        }))
  )
  const adminLeaderMax = Math.max(1, ...adminLeaderRows.map((r) => r.score))
  const adminPodium = adminLeaderRows.length >= 3
    ? [2, 1, 3].map((rank) => adminLeaderRows.find((r) => r.rank === rank)).filter(Boolean) as typeof adminLeaderRows
    : adminLeaderRows.slice(0, 3)
  const studentSchoolRankings = asArray<any>(studentDashboard?.rankings?.school?.leaderboard)
  const studentTeacherRankings = asArray<any>(studentDashboard?.rankings?.teacher?.leaderboard)
  const studentLeaderSource = studentRankTab === 'school' ? studentSchoolRankings : studentTeacherRankings
  const studentLeaderRows = studentLeaderSource
    .map((r: any) => ({
      id: Number(r.id),
      rank: Number(r.rank_position) || 0,
      name: r.full_name,
      avatar: r.avatar_url,
      sub: `${r.interview_count || 0}/10 interviews`,
      score: Number(r.final_score ?? r.student_points) || 0,
      tag: r.submission_status || '—',
      isMe: String(r.participant_id || '') === String(studentDashboard?.student?.participant_id || ''),
    }))
    .slice()
    .sort((a, b) => (a.rank || 999) - (b.rank || 999))
  const studentLeaderMax = Math.max(1, ...studentLeaderRows.map((r) => r.score))
  const studentPodium = studentLeaderRows.length >= 3
    ? [2, 1, 3].map((rank) => studentLeaderRows.find((r) => r.rank === rank)).filter(Boolean) as typeof studentLeaderRows
    : studentLeaderRows.slice(0, 3)
  const schoolRankedStudents = asArray<any>(schoolDashboard?.rankings?.students)
  const schoolRankedTeachers = asArray<any>(schoolDashboard?.rankings?.teachers)
  const teacherRankedStudents = asArray<any>(teacherDashboard?.rankings?.students)
  const teacherRankedTeachers = asArray<any>(teacherDashboard?.rankings?.teachers)
  // ---- Active-role data: school principal AND teacher render the same components,
  // just fed their own scoped collections (active* === school data for the principal). ----
  const isManagerLayout = !!schoolDashboard || !!teacherDashboard
  const activeManagesTeachers = !!schoolDashboard // only the principal manages teacher records
  const isTeacherLayout = !!teacherDashboard // teacher: read-only, no content/PII, counts only
  const isSchoolLayout = !!schoolDashboard // principal: roster + approvals, no content/scoring
  const activeStudents = schoolDashboard ? asArray<any>(schoolDashboard.students) : asArray<any>(teacherDashboard?.students)
  const activeTeachers = asArray<any>(schoolDashboard?.teachers)
  const activeBusinesses = schoolDashboard ? schoolBusinesses : teacherBusinesses
  const activeApprovals = schoolDashboard ? schoolApprovals : teacherApprovals
  const activeSubmissions = schoolDashboard ? schoolSubmissions : teacherSubmissions
  const activeRankedStudents = schoolDashboard ? schoolRankedStudents : teacherRankedStudents
  const activeRankedTeachers = schoolDashboard ? schoolRankedTeachers : teacherRankedTeachers
  const activeWinners = schoolDashboard ? schoolWinners : teacherWinners
  const activeNotifications = schoolDashboard ? schoolNotifications : teacherNotifications
  const activeUnreadNotifications = activeNotifications.filter((item: any) => !item.is_read)
  const activeSummary = (schoolDashboard?.summary || teacherDashboard?.summary || {}) as Record<string, any>
  const myDashboardSchoolId = schoolDashboard?.school?.id
    ?? teacherDashboard?.teacher?.school_id ?? teacherDashboard?.school?.id
    ?? studentDashboard?.student?.school_id
    ?? parentDashboard?.student_context?.student?.school_id
    ?? null
  const schoolLeaderRows = (schoolRankingTab === 'students'
    ? activeRankedStudents.map((r: any) => ({
        id: Number(r.id), type: 'student' as const, rank: Number(r.rank_position) || 0,
        name: r.full_name, avatar: r.avatar_url, sub: r.teacher_full_name ? `Mentor · ${r.teacher_full_name}` : r.school_name || '—',
        score: Number(r.final_score ?? r.student_points) || 0, tag: r.submission_status || '—', tagType: 'status' as const,
      }))
    : activeRankedTeachers.map((r: any) => ({
        id: Number(r.id), type: 'teacher' as const, rank: Number(r.rank_position) || 0,
        name: r.teacher_full_name, avatar: r.avatar_url, sub: r.role_department || 'Faculty',
        score: Number(r.teacher_points) || 0, tag: `${r.students_total ?? 0} students`, tagType: 'count' as const,
      }))
  ).slice().sort((a, b) => (a.rank || 999) - (b.rank || 999))
  const schoolLeaderMax = Math.max(1, ...schoolLeaderRows.map((r) => r.score))
  const schoolPodium = schoolLeaderRows.length >= 3
    ? [2, 1, 3].map((rank) => schoolLeaderRows.find((r) => r.rank === rank)).filter(Boolean) as typeof schoolLeaderRows
    : schoolLeaderRows.slice(0, 3)

  useEffect(() => {
    if (!isDashboardRoute) return
    setDashboardTab((current) => {
      const nextTab = dashboardTabs.find((tab) => tab.key === current) ? current : dashboardTabs[0]?.key || 'overview'
      return nextTab
    })
  }, [dashboardRole, isDashboardRoute])

  useEffect(() => {
    if (!approvalDetail) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setApprovalDetail(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [approvalDetail])

  useEffect(() => {
    if (!recordModal) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && recordModal.mode === 'view') setRecordModal(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [recordModal])

  const currentParticipantId = studentDashboard?.student?.participant_id || parentDashboard?.student_context?.student?.participant_id || ''
  const studentUnreadNotifications = studentNotifications.filter((item: any) => !item.is_read)
  const parentUnreadNotifications = parentNotifications.filter((item: any) => !item.is_read)
  const schoolUnreadNotifications = schoolNotifications.filter((item: any) => !item.is_read)
  const teacherUnreadNotifications = teacherNotifications.filter((item: any) => !item.is_read)
  const adminUnreadNotifications = adminNotifications.filter((item: any) => !item.is_read)
  const schoolRecordsTabs: Array<{ key: SchoolRecordsTabKey; label: string; hint: string; count: number }> = [
    { key: 'students', label: 'Students', hint: 'Roster', count: activeStudents.length },
    ...(activeManagesTeachers ? [{ key: 'teachers' as SchoolRecordsTabKey, label: 'Teachers', hint: 'Faculty list', count: activeTeachers.length }] : []),
    { key: 'interviews', label: 'Interviews', hint: 'Business visits', count: activeBusinesses.length },
    { key: 'approvals', label: 'Approvals', hint: 'Verified records', count: activeApprovals.length },
    { key: 'projects', label: 'Projects', hint: 'Final submissions', count: activeSubmissions.length },
  ]
  const approvalStatusOptions = [
    { key: 'all', label: 'All' },
    { key: 'approved', label: 'Approved' },
    { key: 'pending', label: 'Pending' },
    { key: 'rejected', label: 'Rejected' },
  ]
  const approvalSearchTerm = schoolApprovalSearch.trim().toLowerCase()
  const filteredApprovalStudents = activeStudents.filter((row: any) => {
    const matchesSearch = !approvalSearchTerm
      || `${row.full_name || ''} ${row.participant_id || ''}`.toLowerCase().includes(approvalSearchTerm)
    // Teacher approval is the single student gate (principal & teacher record the same approval).
    const st = String(row.teacher_approval_status || 'pending').toLowerCase()
    const matchesStatus = schoolApprovalStatus === 'all' || st === schoolApprovalStatus
    return matchesSearch && matchesStatus
  })
  const filteredApprovalTeachers = activeTeachers.filter((row: any) => {
    const matchesSearch = !approvalSearchTerm
      || `${row.teacher_full_name || ''} ${row.role_department || ''}`.toLowerCase().includes(approvalSearchTerm)
    // A freshly registered teacher has status 'registered' — surface it under the Pending filter.
    const ts = String(row.status || 'registered').toLowerCase()
    const matchesStatus = schoolApprovalStatus === 'all'
      || ts === schoolApprovalStatus
      || (schoolApprovalStatus === 'pending' && (ts === 'registered' || ts === 'pending'))
    return matchesSearch && matchesStatus
  })
  // Parents the teacher can approve (student already confirmed the link).
  const activeParents = asArray<any>(teacherDashboard?.parents)
  const filteredApprovalParents = activeParents.filter((row: any) => {
    const matchesSearch = !approvalSearchTerm
      || `${row.parent_full_name || ''} ${row.student_name || ''} ${row.participant_id || ''}`.toLowerCase().includes(approvalSearchTerm)
    const link = String(row.link_status || '').toLowerCase()
    const matchesStatus = schoolApprovalStatus === 'all'
      || link === schoolApprovalStatus
      || (schoolApprovalStatus === 'pending' && link.startsWith('pending'))
    return matchesSearch && matchesStatus
  })
  const approvalDetailRecord = approvalDetail
    ? (approvalDetail.type === 'student'
        ? activeStudents.find((row: any) => Number(row.id) === approvalDetail.id)
        : activeTeachers.find((row: any) => Number(row.id) === approvalDetail.id)) || null
    : null
  const recordArrayFor = (entity: RecordEntity): any[] => {
    if (entity === 'student') return activeStudents
    if (entity === 'teacher') return activeTeachers
    if (entity === 'interview') return activeBusinesses
    if (entity === 'approval') return activeApprovals
    return activeSubmissions
  }
  const recordCurrent = recordModal && recordModal.id != null
    ? recordArrayFor(recordModal.entity).find((row: any) => Number(row.id) === recordModal.id) || null
    : null
  const recordTitle = (entity: RecordEntity, rec: any): string => {
    if (!rec) return RECORD_DEFS[entity].label
    if (entity === 'student') return rec.full_name || `Student #${rec.id}`
    if (entity === 'teacher') return rec.teacher_full_name || `Teacher #${rec.id}`
    if (entity === 'interview') return rec.business_name || `Visit #${rec.id}`
    if (entity === 'approval') return `${rec.student_name || 'Student'} · ${rec.approval_type || ''}`
    return rec.student_name || `Submission #${rec.id}`
  }
  const formFromRecord = (entity: RecordEntity, rec: any): Record<string, any> => {
    const out: Record<string, any> = {}
    RECORD_DEFS[entity].fields.forEach((f) => {
      if (f.createOnly) return
      out[f.key] = f.type === 'checkbox'
        ? (rec[f.key] === 1 || rec[f.key] === true || rec[f.key] === '1')
        : (rec[f.key] ?? '')
    })
    return out
  }
  const defaultFormFor = (entity: RecordEntity): Record<string, any> => {
    const out: Record<string, any> = {}
    RECORD_DEFS[entity].fields.forEach((f) => {
      if (f.editOnly) return
      out[f.key] = f.type === 'checkbox' ? false : (f.type === 'select' && f.options ? f.options[0] : '')
    })
    return out
  }
  // Detail-modal field visibility + write permission by role (manager layout = school/teacher only).
  const visibleRecordFields = (entity: RecordEntity) =>
    RECORD_DEFS[entity].fields.filter((f) => {
      if (f.key === 'password') return false
      if (NS_CONTENT_FIELD_KEYS.has(f.key)) return false // content hidden from teacher & school
      if (isTeacherLayout && NS_PII_FIELD_KEYS.has(f.key)) return false // PII hidden from teacher
      return true
    })
  const canWriteRecordEntity = (entity: RecordEntity) => isSchoolLayout && ['student', 'teacher', 'approval'].includes(entity)
  const openRecordView = (entity: RecordEntity, id: number) => setRecordModal({ entity, mode: 'view', id })
  const openRecordCreate = (entity: RecordEntity) => {
    if (!canWriteRecordEntity(entity)) return
    setRecordForm(defaultFormFor(entity)); setRecordModal({ entity, mode: 'create', id: null })
  }
  const startRecordEdit = () => {
    if (!recordModal || !recordCurrent) return
    if (!canWriteRecordEntity(recordModal.entity)) return
    setRecordForm(formFromRecord(recordModal.entity, recordCurrent))
    setRecordModal({ ...recordModal, mode: 'edit' })
  }
  const setRecordField = (key: string, value: any) => setRecordForm((prev) => ({ ...prev, [key]: value }))
  const saveRecord = async () => {
    if (!recordModal) return
    if (!canWriteRecordEntity(recordModal.entity)) { showNotice('error', 'Your role cannot modify this record.'); return }
    const def = RECORD_DEFS[recordModal.entity]
    setRecordBusy(true)
    try {
      if (recordModal.mode === 'create') {
        await api.post(def.api, recordForm)
        showNotice('success', `${def.label} created.`)
      } else if (recordModal.id != null) {
        await api.put(`${def.api}/${recordModal.id}`, recordForm)
        showNotice('success', `${def.label} updated.`)
      }
      setRecordModal(null)
      await reloadDashboard()
      await reloadOverview()
    } catch (err) {
      handleError(err, 'Could not save the record.')
    } finally {
      setRecordBusy(false)
    }
  }
  const deleteRecord = async () => {
    if (!recordModal || recordModal.id == null) return
    if (!canWriteRecordEntity(recordModal.entity)) return
    const def = RECORD_DEFS[recordModal.entity]
    if (typeof window !== 'undefined' && !window.confirm(`Delete this ${def.label.toLowerCase()}? This cannot be undone.`)) return
    setRecordBusy(true)
    try {
      await api.del(`${def.api}/${recordModal.id}`)
      showNotice('success', `${def.label} deleted.`)
      setRecordModal(null)
      await reloadDashboard()
      await reloadOverview()
    } catch (err) {
      handleError(err, 'Could not delete the record.')
    } finally {
      setRecordBusy(false)
    }
  }
  const schoolSelectedSubmission = activeSubmissions.find((row: any) => String(row.id) === String(schoolSubmissionReviewId)) || activeSubmissions[0] || null
  const schoolReviewQueue = activeSubmissions.slice(0, 5)
  const schoolWinnersQueue = activeWinners.slice(0, 5)
  const dashboardTabs = (() => {
    const baseTabs = dashboardRole ? dashboardTabsByRole[dashboardRole] || [] : []
    if (!isManagerLayout) return baseTabs
    const approvalBadge = (Number(activeSummary.teacher_pending || 0) + Number(activeSummary.school_pending || 0) + Number(activeSummary.parent_pending || 0)) || 0
    const alertBadge = activeUnreadNotifications.length || 0
    return baseTabs.map((tab) => {
      if (tab.key === 'approvals' && approvalBadge > 0) return { ...tab, badge: String(approvalBadge) }
      if (tab.key === 'notifications' && alertBadge > 0) return { ...tab, badge: String(alertBadge) }
      return tab
    })
  })()
  const dashboardActiveTab = dashboardTabs.find((tab) => tab.key === dashboardTab) || dashboardTabs[0] || null
  const dashboardHero = (() => {
    if (studentDashboard) {
      return {
        eyebrow: 'Your Dashboard',
        title: studentDashboard.student.full_name,
        lead: 'See how you are doing and jump straight to your next step.',
        stats: [
          { label: 'Points', value: studentDashboard.final_score ?? studentDashboard.student_points ?? 0, tab: 'rankings' as DashboardTabKey },
          { label: 'Interviews', value: studentDashboard.interview_count || 0, tab: 'activity' as DashboardTabKey },
          { label: 'School Rank', value: `#${studentDashboard.rankings?.school?.position || '-'}`, tab: 'rankings' as DashboardTabKey },
          { label: 'Teacher Rank', value: `#${studentDashboard.rankings?.teacher?.position || '-'}`, tab: 'rankings' as DashboardTabKey },
        ],
        primary: { label: 'Continue Activity', tab: 'activity' as DashboardTabKey },
        secondary: { label: 'View Rankings', tab: 'rankings' as DashboardTabKey },
      }
    }
    if (parentDashboard) {
      return {
        eyebrow: 'Parent Dashboard',
        title: parentDashboard.parent.parent_full_name,
        lead: 'See your child’s approval, progress, and rank in one simple view.',
        stats: [
          { label: 'Student', value: parentDashboard.parent.student_full_name || '-', tab: 'profile' as DashboardTabKey },
          { label: 'Consent', value: parentDashboard.student_context?.student?.parent_consent_status || 'pending', tab: 'overview' as DashboardTabKey },
          { label: 'Rank', value: `#${parentDashboard.student_context?.rankings?.school?.position || '-'}`, tab: 'rankings' as DashboardTabKey },
          { label: 'Unread', value: parentUnreadNotifications.length || 0, tab: 'notifications' as DashboardTabKey },
        ],
        primary: { label: 'Open Overview', tab: 'overview' as DashboardTabKey },
        secondary: { label: 'View Rankings', tab: 'rankings' as DashboardTabKey },
      }
    }
    if (schoolDashboard) {
      return {
        eyebrow: 'School Dashboard',
        title: schoolDashboard.school.school_name,
        lead: 'Approve teachers and keep an eye on how your school is doing.',
        stats: [
          { label: 'Students', value: schoolDashboard.summary.students_total || 0, tab: 'records' as DashboardTabKey },
          { label: 'Teachers', value: schoolDashboard.summary.teacher_approved || 0, tab: 'approvals' as DashboardTabKey, approvalsTab: 'teachers' as const },
          { label: 'Eligible', value: schoolDashboard.summary.eligible_to_submit || 0, tab: 'records' as DashboardTabKey },
          { label: 'Submissions', value: schoolDashboard.summary.submitted || 0, tab: 'records' as DashboardTabKey },
        ],
        primary: { label: 'Manage Approvals', tab: 'approvals' as DashboardTabKey },
        secondary: { label: 'Open Rankings', tab: 'rankings' as DashboardTabKey },
      }
    }
    if (teacherDashboard) {
      return {
        eyebrow: 'Teacher Dashboard',
        title: teacherDashboard.teacher.teacher_full_name,
        lead: 'Approve your students, check their work, and watch your class climb the board.',
        stats: [
          { label: 'Students', value: teacherDashboard.summary.students_total || 0, tab: 'records' as DashboardTabKey },
          { label: 'Submitted', value: teacherDashboard.summary.submitted || 0, tab: 'records' as DashboardTabKey },
          { label: 'Approved', value: teacherDashboard.summary.teacher_approved || 0, tab: 'approvals' as DashboardTabKey, approvalsTab: 'students' as const, filter: 'approved' },
          { label: 'Points', value: teacherDashboard.teacher_points || 0, tab: 'rankings' as DashboardTabKey },
        ],
        primary: { label: 'Review Approvals', tab: 'approvals' as DashboardTabKey },
        secondary: { label: 'Open Rankings', tab: 'rankings' as DashboardTabKey },
      }
    }
    if (adminDashboard) {
      return {
        eyebrow: 'Admin Dashboard',
        title: 'Program Control Center',
        lead: 'See schools, approvals, submissions, and rankings all in one place.',
        stats: [
          { label: 'Schools', value: adminDashboard.summary.schools || 0, tab: 'data' as DashboardTabKey },
          { label: 'Students', value: adminDashboard.summary.students || 0, tab: 'data' as DashboardTabKey },
          { label: 'Teachers', value: adminDashboard.summary.teachers || 0, tab: 'data' as DashboardTabKey },
          { label: 'Winners', value: adminDashboard.summary.winners || 0, tab: 'reviews' as DashboardTabKey },
        ],
        primary: { label: 'Open Data', tab: 'data' as DashboardTabKey },
        secondary: { label: 'Review Results', tab: 'reviews' as DashboardTabKey },
      }
    }
    return null
  })()
  const dashboardThemeClass = dashboardRole ? `ns-dashboard-page--${dashboardRole}` : 'ns-dashboard-page--guest'
  // The principal-style "reference" layout (brand rail + workspace card + readiness
  // bar + topbar) is now shared by every signed-in role, not just the school.
  const isReferenceLayout = dashboardRole !== ''
  const dashboardRoleLabel = ({ student: 'Student', parent: 'Parent', school: 'Principal', teacher: 'Teacher', admin: 'Admin' } as Record<string, string>)[dashboardRole] || 'Member'
  const dashboardReadiness = studentDashboard
    ? { value: studentStatusProgress, label: 'Your progress' }
    : parentDashboard
      ? { value: parentReadinessProgress, label: 'Student progress' }
      : schoolDashboard
        ? { value: schoolReadinessProgress, label: 'School progress' }
        : teacherDashboard
          ? { value: teacherReadinessProgress, label: 'Class progress' }
          : adminDashboard
            ? { value: adminReadinessProgress, label: 'Program progress' }
            : null
  const dashboardAvatarChar = String(user?.full_name || dashboardHero?.title || dashboardRoleLabel || '?').trim().charAt(0).toUpperCase()
  const dashboardStageId = 'dashboard-stage'
  const openDashboardTab = (nextTab: DashboardTabKey) => {
    setDashboardTab(nextTab)
    if (typeof window === 'undefined') return
    window.requestAnimationFrame(() => {
      const stage = document.getElementById(dashboardStageId)
      stage?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      stage instanceof HTMLElement ? stage.focus({ preventScroll: true }) : undefined
    })
  }

  // Clicking a summary stat card jumps to the tab that shows that data (and, for
  // approval-linked stats, pre-selects the right sub-tab + status filter).
  const onStatClick = (stat: { tab?: DashboardTabKey; approvalsTab?: 'students' | 'teachers' | 'parents'; filter?: string }) => {
    if (!stat || !stat.tab) return
    if (stat.approvalsTab) setSchoolApprovalsTab(stat.approvalsTab)
    if (stat.filter) setSchoolApprovalStatus(stat.filter)
    openDashboardTab(stat.tab)
  }

  return (
    <div className="ns-page">
      {!isDashboardRoute && (
        <>
      <section className="ns-hero ns-hero--founder">
        <div className="ns-hero__bg" aria-hidden="true">
          <span className="ns-hero__orb ns-hero__orb--one" />
          <span className="ns-hero__orb ns-hero__orb--two" />
          <span className="ns-hero__grid" />
        </div>
        <div className="wrap ns-hero__grid-wrap">
          <div className="ns-hero__copy reveal">
            <p className="eyebrow">Frantz Coutard Presents · 1st Annual</p>
            <h1 className="ns-hero__headline">
              <span className="ns-hero__headline-kicker">Student</span>
              <span className="ns-hero__headline-main gold-text">Impact Challenge</span>
            </h1>
            <p className="ns-hero__script">Leave It Better Than You Found It.</p>
            <p className="ns-lead">
              {challenge.lead || `Students interview local businesses, solve a real community problem, and compete for over ${totalAwardsLabel} in scholarships, school grants, and recognition.`}
            </p>
            <div className="ns-hero__register">
              <span className="ns-hero__register-label">Get started — register as</span>
              <div className="ns-hero__register-grid">
                <button className="btn btn--solid" type="button" data-auth="register" data-role="student">Student</button>
                <button className="btn" type="button" data-auth="register" data-role="parent">Parent</button>
                <button className="btn" type="button" data-auth="register" data-role="school">School</button>
                <button className="btn" type="button" data-auth="register" data-role="teacher">Teacher</button>
              </div>
              <div className="ns-hero__links">
                <a className="ns-hero__how" href="#workflow">See how it works ↓</a>
                <a className="btn btn--sm" href="/docs/leave_it_better_media_kit_2026.pdf" download>⬇ Download Media Kit 2026</a>
              </div>
            </div>
            {notice && <div className={`ns-alert ns-alert--${notice.tone}`}>{notice.text}</div>}
            {token && parentLink?.student && (
              <div className="ns-qr-banner glass">
                <div>
                  <span className="eyebrow">QR Consent Link</span>
                  <strong>{parentLink.student.full_name}</strong>
                  <p>Participant ID: {parentLink.student.participant_id}</p>
                </div>
                <div className="ns-qr-banner__preview">
                  <img src={qrImageSrc(parentLink.student.qr_url)} alt="Parent consent QR code" />
                </div>
                <button className="btn btn--sm" type="button" onClick={() => navigator.clipboard.writeText(window.location.href)}>
                  Copy Link
                </button>
              </div>
            )}
          </div>

          <aside className="ns-hero__portrait-wrap reveal">
            <div className="ns-hero__portrait glass">
              <img src="/assets/challenge-poster.webp" alt="TrendCatch Student Impact Challenge — Leave It Better Than You Found It, founded by Frantz Coutard" loading="eager" decoding="async" />
            </div>
          </aside>
        </div>
      </section>

      <section className="block ns-section" id="purpose">
        <div className="wrap">
          <div className="ns-purpose">
            <div className="ns-purpose__lead reveal">
              <span className="eyebrow">A Challenge With Purpose</span>
              <h2>Every community faces challenges. Every student has ideas.</h2>
              <p>This initiative empowers students to identify real-world problems, collaborate with local businesses, develop solutions, and create measurable impact in their communities — building future entrepreneurs and stronger neighborhoods along the way.</p>
            </div>
            <div className="ns-calling glass reveal d1">
              <span className="eyebrow">Calling</span>
              <h3>Schools · Educators · Students · Parents</h3>
              <p>Join New York's growing movement of future innovators, entrepreneurs, and community leaders.</p>
              <div className="ns-calling__chips">
                {callingAudiences.map((aud) => (
                  <div className="ns-calling__chip" key={aud.title}>
                    <strong>{aud.title}</strong>
                    <span>{aud.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="block ns-section ns-section--awards" id="awards">
        <div className="wrap">
          <div className="ns-section__head reveal">
            <span className="eyebrow">Awards &amp; Recognition</span>
            <h2>Over <span className="gold-text">{totalAwardsLabel}</span> in Awards &amp; Recognition</h2>
            <p>Real investment in students, schools, and the educators who make it possible.</p>
          </div>
          <div className="ns-awards">
            {awardHighlights.map((award, i) => (
              <article className={`glass ns-award-card reveal d${i + 1}`} key={award.label}>
                <span className="ns-award-card__amount gold-text">{award.amount}</span>
                <strong className="ns-award-card__label">{award.label}</strong>
                <p>{award.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="block ns-section" id="live-stats">
        <div className="wrap">
          <div className="ns-section__head reveal">
            <span className="eyebrow">The Movement So Far</span>
            <h2>Live challenge momentum, updated in real time.</h2>
            <p>Schools, students, interviews, and community problems tracked as the movement grows across New York.</p>
          </div>

          <div className="ns-stat-tiles">
            {movementStats.map((item, i) => (
              <article className={`glass ns-stat-tile reveal d${(i % 4) + 1}`} key={item.label}>
                <strong>{item.value}</strong>
                <span>{item.label}</span>
              </article>
            ))}
          </div>

          <article className="glass ns-snapshot reveal">
            <div className="ns-snapshot__head">
              <span className="eyebrow">Live Snapshot</span>
              <div className="ns-snapshot__progress">
                <div className="ns-award__head">
                  <strong>Challenge Momentum</strong>
                  <span>{challengeProgressPercent}%</span>
                </div>
                <div className="ns-award__bar">
                  <span style={{ width: `${challengeProgressPercent}%` }} />
                </div>
                <p className="ns-muted" style={{ margin: '10px 0 0' }}>
                  {overviewSyncedAt ? `Synced ${formatSyncTime(overviewSyncedAt)}` : 'Waiting for live sync'} - {liveSchools} schools - {liveTeachers} teachers - {liveStudents} students{liveWinners > 0 ? ` - ${liveWinners} winners` : ''}
                </p>
              </div>
            </div>
            <div className="ns-snapshot__rows">
              {latestWinner && (
                <div className="ns-winner-row">
                  <strong>Winner</strong>
                  <em>{latestWinner.student_name}</em>
                  <span>{formatMoney(latestWinner.scholarship_amount)}</span>
                </div>
              )}
              {topSchool && (
                <div className="ns-winner-row">
                  <strong>Top School</strong>
                  <em>{topSchool.label}</em>
                  <span>{topSchool.submissions || 0} subs</span>
                </div>
              )}
              {topTeacher && (
                <div className="ns-winner-row">
                  <strong>Top Teacher</strong>
                  <em>{topTeacher.label}</em>
                  <span>{topTeacher.students || 0} students</span>
                </div>
              )}
              {topStudent && (
                <div className="ns-winner-row">
                  <strong>Top Student</strong>
                  <em>{topStudent.label}</em>
                  <span>{topStudent.interview_count || 0} interviews</span>
                </div>
              )}
              {!latestWinner && !topSchool && !topStudent && (
                <div className="ns-winner-row">
                  <strong>Current Status</strong>
                  <em>{liveSchools} schools - {liveStudents} students</em>
                  <span>{overviewSyncedAt ? `Synced ${formatSyncTime(overviewSyncedAt)}` : 'Waiting for first live sync'}</span>
                </div>
              )}
            </div>
          </article>
        </div>
      </section>

      <section className="block ns-section" id="workflow">
        <div className="wrap">
          <div className="ns-section__head reveal">
            <span className="eyebrow">How It Works</span>
            <h2>From registration to scholarships and school grants.</h2>
            <p>Each step moves students closer to a solution that addresses a real community problem.</p>
          </div>

          <div className="ns-workflow">
            {movementSteps.map((step) => (
              <article className="glass ns-workflow__step reveal in" key={step.title}>
                <span className="ns-workflow__num">{step.badge}</span>
                <h3>{step.title}</h3>
                <p>{step.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="block ns-section" id="participants">
        <div className="wrap">
          <div className="ns-section__head reveal">
            <span className="eyebrow">Who Can Participate</span>
            <h2>Students lead. Everyone makes it possible.</h2>
            <p>Open to students ages {ageRange} in grades {gradeRange} — supported by schools, families, educators, sponsors, and community partners.</p>
          </div>

          <div className="ns-eligibility reveal">
            <div className="ns-eligibility__pills">
              <span className="ns-pill ns-pill--solid">Ages {ageRange}</span>
              <span className="ns-pill ns-pill--solid">Grades {gradeRange}</span>
            </div>
            <div className="ns-eligibility__pills">
              {schoolTypeChips.map((type) => (<span className="ns-pill" key={type}>{type}</span>))}
            </div>
          </div>

          <div className="ns-participant-grid">
            {participantCards.map((card, i) => (
              <article className={`glass ns-info-card reveal d${(i % 4) + 1}`} key={card.title}>
                <span className="ns-info-card__kicker">{card.kicker}</span>
                <h3>{card.title}</h3>
                <p>{card.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="block ns-section" id="gains">
        <div className="wrap">
          <div className="ns-section__head reveal">
            <span className="eyebrow">What Students Will Gain</span>
            <h2>More than a competition — a launchpad for problem solvers.</h2>
            <p>Every participant walks away with skills, experience, and opportunities that outlast the challenge.</p>
          </div>
          <div className="ns-gains">
            {studentGains.map((gain, i) => (
              <article className={`glass ns-gain reveal d${(i % 4) + 1}`} key={gain.title}>
                <span className="ns-gain__marker" aria-hidden="true" />
                <strong>{gain.title}</strong>
                <p>{gain.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="block ns-section" id="timeline">
        <div className="wrap">
          <div className="ns-section__head reveal">
            <span className="eyebrow">Challenge Timeline</span>
            <h2>From launch to winners — the full journey.</h2>
            <p>{deadlineDays !== null ? `${deadlineDays} days left to make your impact.` : 'Key dates for the 2026 challenge.'}</p>
          </div>
          <ol className="ns-timeline">
            {timelineMilestones.map((m, i) => (
              <li className={`ns-timeline__item reveal${m.highlight ? ' is-highlight' : ''}`} key={m.phase}>
                <span className="ns-timeline__dot" aria-hidden="true">{i + 1}</span>
                <div className="ns-timeline__body glass">
                  <strong>{m.phase}</strong>
                  <span>{m.when}</span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Dynamic Results — phase-aware: challenge → judging → winners + award ceremony */}
      <section className="block ns-section" id="results">
        <div className="wrap">
          <div className="ns-section__head reveal">
            <span className="eyebrow">Results</span>
            <h2>
              {challenge.phase === 'results' ? 'Winners & Award Ceremony'
                : challenge.phase === 'judging' ? 'Judging & Review'
                : 'Challenge In Progress'}
            </h2>
            <p>
              {challenge.phase === 'results' ? 'Congratulations to this year’s winners — see the results and ceremony details below.'
                : challenge.phase === 'judging' ? `Submissions are closed and our judges are reviewing every project. Winners announced ${winnersAnnouncedLabel}.`
                : `The community challenge is underway. Submissions close ${deadlineLabel}, then judging begins. Winners announced ${winnersAnnouncedLabel}.`}
            </p>
          </div>

          {challenge.phase === 'results' && (
            <article className="glass ns-dash-card ns-dash-card--wide reveal in ns-leaderboard-card">
              <div className="ns-dash-card__head">
                <span className="eyebrow">Final Leaderboard</span>
              </div>
              <div className="ns-record-tabs" role="tablist" aria-label="Leaderboard view">
                <button type="button" role="tab" aria-selected={resultsTab === 'students'} className={`ns-record-tabs__btn ${resultsTab === 'students' ? 'is-active' : ''}`} onClick={() => setResultsTab('students')}>
                  <strong>Students</strong><span>Top competitors</span><em>{publicLeaderRows.length}</em>
                </button>
                <button type="button" role="tab" aria-selected={resultsTab === 'schools'} className={`ns-record-tabs__btn ${resultsTab === 'schools' ? 'is-active' : ''}`} onClick={() => setResultsTab('schools')}>
                  <strong>Schools</strong><span>By submissions</span><em>{publicSchoolRows.length}</em>
                </button>
                <button type="button" role="tab" aria-selected={resultsTab === 'teachers'} className={`ns-record-tabs__btn ${resultsTab === 'teachers' ? 'is-active' : ''}`} onClick={() => setResultsTab('teachers')}>
                  <strong>Teachers</strong><span>By submissions</span><em>{publicTeacherRows.length}</em>
                </button>
              </div>

              {boardRows.length === 0 ? (
                <p className="ns-muted" style={{ marginTop: 16 }}>No standings yet — check back after judging.</p>
              ) : (
                <>
                  {boardPodium.length > 0 && (
                    <div className="ns-podium" aria-label="Top performers">
                      {boardPodium.map((pdm) => (
                        <div key={`rpodium-${pdm.id}`} className="ns-podium__place" data-rank={pdm.rank}>
                          <span className="ns-podium__medal" aria-hidden="true">{['🥇', '🥈', '🥉'][pdm.rank - 1] || `#${pdm.rank}`}</span>
                          <span className="ns-podium__avatar">{avatarInner(pdm.name, undefined)}</span>
                          <strong className="ns-podium__name">{pdm.name}</strong>
                          <span className="ns-podium__sub">{pdm.sub}</span>
                          <span className="ns-podium__score">{pdm.right}</span>
                          <span className="ns-podium__pedestal">{pdm.rank}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
                    {boardRows.map((r) => (
                      <div key={`rrow-${r.id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, background: r.rank <= 3 ? 'rgba(201,168,76,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${r.rank <= 3 ? 'var(--gold)' : 'var(--line)'}` }}>
                        <span style={{ flex: '0 0 auto', width: 30, textAlign: 'center', fontWeight: 800, fontSize: 15, color: r.rank <= 3 ? 'var(--gold-light)' : 'var(--muted)' }}>{r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : (r.rank || '—')}</span>
                        <span className="ns-leader-avatar" aria-hidden="true">{avatarInner(r.name, undefined)}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</strong>
                          <span className="msub" style={{ fontSize: 12 }}>{r.sub}</span>
                        </div>
                        <strong className="gold-text" style={{ flex: '0 0 auto', fontSize: 15, whiteSpace: 'nowrap' }}>{r.right}</strong>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </article>
          )}

          {challenge.phase === 'results' && (challenge.ceremony?.date || challenge.ceremony?.venue || challenge.ceremony?.description || challenge.ceremony?.link) && (
            <div className="glass ns-dashboard-entry reveal in" style={{ marginTop: 18 }}>
              <div>
                <span className="eyebrow">🎟 Award Ceremony</span>
                <h3>{challenge.ceremony.date || 'Date to be announced'}</h3>
                {challenge.ceremony.venue && <p style={{ margin: '4px 0' }}>📍 {challenge.ceremony.venue}</p>}
                {challenge.ceremony.description && <p style={{ margin: '4px 0' }}>{challenge.ceremony.description}</p>}
              </div>
              {challenge.ceremony.link && (
                <div className="ns-hero__actions">
                  <a className="btn btn--solid" href={challenge.ceremony.link} target="_blank" rel="noreferrer">Details &amp; RSVP</a>
                </div>
              )}
            </div>
          )}

          {challenge.phase !== 'results' && (
            <div className="glass ns-dashboard-entry reveal in">
              <div>
                <span className="eyebrow">{challenge.phase === 'judging' ? 'Judging In Progress' : 'Live Standings'}</span>
                <h3>{liveStudents} students · {liveSchools} schools taking part</h3>
                <p>{challenge.phase === 'judging' ? 'Results are being finalized. Check back after winners are announced.' : 'Register and start your project to join the movement.'}</p>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="block ns-section ns-section--founder" id="founder">
        <div className="wrap">
          <div className="ns-credibility">
            <div className="ns-credibility__portrait reveal">
              <img src="/assets/frantz-half-face.webp" alt="Frantz Coutard" loading="lazy" decoding="async" />
            </div>
            <div className="ns-credibility__body reveal d1">
              <span className="eyebrow">From The Founder</span>
              <h2>The future belongs to problem solvers.</h2>
              <p>The Student Impact Challenge is built to give young people the tools, mentorship, and stage to lead real change in their communities — and to recognize the schools and educators who make it possible.</p>
              <img className="ns-credibility__sign signature-mark" src={FRANTZ_SIGNATURE} alt="Frantz Coutard signature" loading="lazy" decoding="async" />
              <p className="ns-credibility__role">CEO &amp; Founder · TrendCatch Network</p>
              <div className="ns-medal-strip" aria-label="Founder recognition">
                {featuredAwards.map((award) => (
                  <button
                    key={award.id}
                    type="button"
                    className="ns-medal-strip__item"
                    data-lightbox-src={award.image}
                    data-lightbox-cap={award.name}
                    data-lightbox-alt={award.name}
                    aria-label={`Open award image: ${award.name}`}
                    title={award.name}
                  >
                    <img src={award.image} alt={award.name} title={award.name} loading="lazy" decoding="async" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="block ns-section ns-section--register" id="registration">
        <div className="wrap">
          <div className="ns-cta-band reveal">
            <div>
              <span className="eyebrow">Register Today</span>
              <h2>Students ages {ageRange} welcome · Grades {gradeRange}</h2>
              <p>Public · Private · Charter · Trade Schools. Choose your role below to get started.</p>
            </div>
          </div>
          <div className="ns-section__head reveal">
            <p>Choose a user tag first — the matching registration fields appear so each account type only sees the inputs it needs. Sponsors use the founding sponsor page.</p>
          </div>

          <ChallengeRegistration tag={registrationTag} onTagChange={(t) => setRegistrationTag(t)} token={token} />
        </div>
      </section>

      <section className="block ns-section" id="dashboard-info">
        <div className="wrap">
          <div className="ns-section__head reveal">
            <span className="eyebrow">Dashboard Information</span>
            <h2>Every role gets a focused workspace after registration and approval.</h2>
            <p>Students, parents, school leaders, and teachers each land in a role-based dashboard built from the same challenge data.</p>
          </div>

          <div className="ns-dashboard-info-grid">
            {dashboardInfoCards.map((card) => (
              <article className="glass ns-info-card reveal in" key={card.title}>
                <span className="ns-info-card__kicker">Dashboard</span>
                <h3>{card.title}</h3>
                <p>{card.detail}</p>
              </article>
            ))}
          </div>

          <div className="glass ns-dashboard-entry reveal in">
            <div>
              <span className="eyebrow">Member Access</span>
              <h3>Already registered?</h3>
              <p>Approved accounts can move from public information into live tracking, approvals, rankings, and private records from the dashboard.</p>
            </div>
            <div className="ns-hero__actions">
              <Link className="btn btn--solid" to={dashboardHref}>Open Dashboard</Link>
              <button className="btn" type="button" data-auth="login">Member Login</button>
            </div>
          </div>
        </div>
      </section>

      <section className="block ns-section" id="founding-sponsors">
        <div className="wrap">
          <div className="ns-section__head reveal">
            <span className="eyebrow">Founding Sponsors</span>
            <h2>Support a scholarship-driven challenge that schools can rally behind.</h2>
            <p>Founding sponsors help power school grants, student scholarships, educator recognition, and the community visibility needed to grow the movement across New York.</p>
          </div>

          <div className="ns-dashboard-info-grid">
            {sponsorPillars.map((pillar) => (
              <article className="glass ns-info-card reveal in" key={pillar.title}>
                <span className="ns-info-card__kicker">Why Sponsor</span>
                <h3>{pillar.title}</h3>
                <p>{pillar.detail}</p>
              </article>
            ))}
          </div>

          <div className="glass ns-sponsor-callout reveal in">
            <div>
              <span className="eyebrow">Founding Sponsor Registration</span>
              <h3>Open the sponsor page and submit your organization details.</h3>
              <p>Use the dedicated sponsor page to review the mission, sponsorship levels, payment instructions, and interest form before the How It Works section.</p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link className="btn btn--solid" to="/new-school/become-a-founding-sponsor">Founding Sponsor Registration</Link>
              <Link className="btn" to="/new-school/founding-sponsors">View Founding Sponsors</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="block ns-section faq-section" id="faq">
        <div className="wrap">
          <div className="ns-section__head reveal">
            <span className="eyebrow">Frequently Asked Questions</span>
            <h2>Answers before you register.</h2>
            <p>Everything families, schools, and students ask most often.</p>
          </div>
          <div className="faq-grid reveal">
            {challengeFaqItems.map((faq) => (
              <details className="faq-item" key={faq.question}>
                <summary>{faq.question}</summary>
                <div className="faq-item__answer"><p>{faq.answer}</p></div>
              </details>
            ))}
          </div>
        </div>
      </section>
      <section className="block ns-section ns-section--values" id="values">
        <div className="wrap">
          <div className="ns-values">
            {coreValues.map((value, i) => (
              <article className={`ns-value reveal d${(i % 4) + 1}`} key={value.title}>
                <strong className="gold-text">{value.title}</strong>
                <span>{value.detail}</span>
              </article>
            ))}
          </div>
          <p className="ns-values__tagline reveal">The future belongs to problem solvers.</p>
        </div>
      </section>
        </>
      )}

      {isDashboardRoute && (
        <>
      <section className={`block ns-section ns-dashboard-page ${dashboardThemeClass}`} id="dashboard" data-dashboard-role={dashboardRole || 'guest'}>
        <div className="wrap">
          {!isReferenceLayout && (
            <div className="ns-section__head reveal">
              <span className="eyebrow">Live Dashboard</span>
              <h2>Role-based tracking for every account type.</h2>
              <p>Student, parent, school, teacher, and admin views are driven from the same data tables.</p>
            </div>
          )}

          <div className="ns-dashboard-shell">
            <aside className="ns-dashboard-rail">
              {isReferenceLayout && dashboardHero && (
                <>
                  <div className="ns-principal-brand glass reveal in">
                    <span className="ns-principal-brand__logo" aria-hidden="true">FC</span>
                    <span className="ns-principal-brand__id">
                      <strong>FRANTZ COUTARD</strong>
                      <small>{dashboardRoleLabel} Dashboard</small>
                    </span>
                  </div>

                  <section className="ns-principal-workspace glass reveal in" aria-label={`${dashboardRoleLabel} workspace`}>
                    <span className="eyebrow">{dashboardHero.eyebrow}</span>
                    <h3 className="ns-principal-workspace__title">{dashboardHero.title}</h3>
                    <div className="ns-principal-workspace__stats">
                      {dashboardHero.stats.map((stat, index) => (
                        <button
                          className="ns-principal-workspace__stat is-clickable"
                          type="button"
                          key={stat.label}
                          onClick={() => onStatClick(stat)}
                          title={`Open ${stat.label}`}
                        >
                          <span>{stat.label}</span>
                          <strong className={index === 3 ? 'is-gold' : ''}>{String(stat.value)}</strong>
                        </button>
                      ))}
                    </div>
                  </section>
                </>
              )}

              {dashboardHero && !isReferenceLayout && (
                <section className="ns-dashboard-hero glass reveal in" aria-label="Dashboard summary">
                  <div className="ns-dashboard-hero__copy">
                    <span className="eyebrow">{dashboardHero.eyebrow}</span>
                    <h3>{dashboardHero.title}</h3>
                    <p>{dashboardHero.lead}</p>
                    <div className="ns-dashboard-hero__actions">
                      <button className="btn btn--solid" type="button" onClick={() => openDashboardTab(dashboardHero.primary.tab)}>
                        {dashboardHero.primary.label}
                      </button>
                      <button className="btn" type="button" onClick={() => openDashboardTab(dashboardHero.secondary.tab)}>
                        {dashboardHero.secondary.label}
                      </button>
                      <button className="btn ns-guide-btn" type="button" onClick={() => setGuideOpen(true)} title="Open the guide & rule book">
                        Guide &amp; Rules
                      </button>
                    </div>
                  </div>
                  <div className="ns-dashboard-hero__stats" aria-label="Quick stats">
                    {dashboardHero.stats.map((stat) => (
                      <div className="ns-dashboard-hero__stat" key={stat.label}>
                        <span>{stat.label}</span>
                        <strong>{String(stat.value)}</strong>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {dashboardRole && <DashboardGuide role={dashboardRole} open={guideOpen} onClose={closeGuide} />}

              <NsRecordDetail
                open={!!recordDetail}
                onClose={() => setRecordDetail(null)}
                kind={recordDetail?.kind || 'interview'}
                record={recordDetail?.record || null}
                scholarship={studentDashboard?.scholarship?.answers || []}
              />

              {dashboardTabs.length > 0 && (
                <div className="ns-dashboard-tabs" role="tablist" aria-label="Dashboard sections" aria-orientation="vertical">
                  {dashboardTabs.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      id={`dashboard-tab-${tab.key}`}
                      className={`ns-dashboard-tabs__btn ${dashboardTab === tab.key ? 'is-active' : ''}`}
                      role="tab"
                      aria-selected={dashboardTab === tab.key}
                      aria-controls={dashboardStageId}
                      onClick={() => openDashboardTab(tab.key)}
                    >
                      <strong>{tab.label}</strong>
                      <span>{tab.hint}</span>
                      {tab.badge && <em className="ns-dashboard-tabs__badge">{tab.badge}</em>}
                    </button>
                  ))}
                </div>
              )}

              {isReferenceLayout && dashboardReadiness && (
                <section className="ns-principal-readiness glass reveal in" aria-label={dashboardReadiness.label}>
                  <div className="ns-principal-readiness__head">
                    <span>{dashboardReadiness.label}</span>
                    <strong>{dashboardReadiness.value}%</strong>
                  </div>
                  <div className="ns-progress-track" aria-hidden="true">
                    <span style={{ width: `${dashboardReadiness.value}%` }} />
                  </div>
                </section>
              )}

              {dashboardActiveTab && !isReferenceLayout && (
                <section className="ns-dashboard-rail__note glass reveal in" aria-label="Current dashboard section">
                  <span className="eyebrow">Current section</span>
                  <h3>{dashboardActiveTab.label}</h3>
                  <p>{dashboardActiveTab.hint}</p>
                </section>
              )}
            </aside>

            <div className="ns-dashboard-stage" id={dashboardStageId} role="region" aria-live="polite" tabIndex={-1}>
              {isReferenceLayout && dashboardActiveTab && (
                <header className="ns-principal-topbar glass reveal in" aria-label="Active dashboard view">
                  <div className="ns-principal-topbar__view">
                    <span className="eyebrow">Active View</span>
                    <h3>{dashboardActiveTab.label}</h3>
                    <p>{dashboardActiveTab.hint}</p>
                  </div>
                  <div className="ns-principal-topbar__meta">
                    <button className="btn btn--sm ns-guide-btn" type="button" onClick={() => setGuideOpen(true)} title="Open the guide and rule book">📘 Guide &amp; Rules</button>
                    <span className="ns-principal-topbar__live"><i aria-hidden="true" />Live</span>
                    <span className="ns-principal-topbar__role">{dashboardRoleLabel}</span>
                    <span className="ns-principal-topbar__avatar" aria-hidden="true">{avatarInner(user?.full_name, user?.avatar_url)}</span>
                  </div>
                </header>
              )}

              {dashboardActiveTab && !isReferenceLayout && (
                <section className="ns-dashboard-stage__head glass reveal in" aria-label="Selected dashboard section">
                  <div>
                    <span className="eyebrow">Active view</span>
                    <h3>{dashboardActiveTab.label}</h3>
                    <p>{dashboardActiveTab.hint}</p>
                  </div>
                  <div className="ns-dashboard-stage__meta">
                    <span className="ns-board__badge">{dashboardHero?.eyebrow || 'Private workspace'}</span>
                    <strong>{dashboardHero?.primary.label || 'Focus mode'}</strong>
                  </div>
                </section>
              )}

              {(loading || dashboardLoading) && (
                <div className="glass ns-empty reveal in">
                  <h3>Loading private dashboard</h3>
                  <p>Fetching your role-specific data now.</p>
                </div>
              )}

              {!loading && !dashboardLoading && !user && (
                <div className="glass ns-empty reveal in">
                  <h3>Sign in to open the live dashboard</h3>
                  <p>Registered students, parents, schools, and teachers can use the normal site login or the member login button in the header.</p>
                  <div className="ns-actions">
                    <button className="btn btn--solid" type="button" data-auth="login">Open Login</button>
                    <Link className="btn" to="/dashboard">Existing Member Area</Link>
                  </div>
                </div>
              )}

              {!loading && !dashboardLoading && user && !hasApprovedChallengeAccess && (
                <div className="glass ns-empty reveal in">
                  <h3>Your account is waiting for approval</h3>
                  <p>
                    {accountApprovalStatus === 'rejected'
                      ? 'This account was rejected. Contact support before trying again.'
                      : user?.role === 'parent'
                        ? 'Your parent dashboard unlocks once your child confirms the link and their teacher approves it.'
                        : user?.role === 'student'
                          ? 'Your dashboard unlocks once your teacher approves your participation.'
                          : 'Private dashboard access unlocks after admin approval.'}
                  </p>
                </div>
              )}

              {!loading && !dashboardLoading && user && hasApprovedChallengeAccess && !studentDashboard && !parentDashboard && !schoolDashboard && !teacherDashboard && !adminDashboard && (
                <div className="glass ns-empty reveal in">
                  <h3>No dashboard data available</h3>
                  <p>Your account is approved, but no role-specific records were found yet.</p>
                </div>
              )}

              {dashboardTab === 'chat' && dashboardRole && dashboardRole !== 'admin' && (
                <div className="ns-dash-grid">
                  <article className="glass ns-dash-card ns-dash-card--wide reveal in ns-chat">
                    <div className="ns-dash-card__head">
                      <span className="eyebrow">Chat with Admin</span>
                      <button type="button" className="btn btn--sm" disabled={chatBusy} onClick={() => void clearChatForMe()}>Clear chat</button>
                    </div>
                    <div className="ns-chat__log">
                      {chatMessages.length === 0 && <p className="ns-muted">No messages yet. Send a message to the admin team below.</p>}
                      {chatMessages.map((m: any) => (
                        <div key={m.id} className={`ns-chat__msg ns-chat__msg--${m.sender === 'admin' ? 'admin' : 'me'}`}>
                          <span className="ns-chat__who">{m.sender === 'admin' ? 'Admin' : 'You'}</span>
                          <p>{m.body}</p>
                          <span className="ns-chat__time">{m.created_at}</span>
                        </div>
                      ))}
                    </div>
                    <form className="ns-chat__form" onSubmit={sendChat}>
                      <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Type a message to the admin…" maxLength={2000} />
                      <button className="btn btn--solid" type="submit" disabled={chatBusy || !chatInput.trim()}>{chatBusy ? 'Sending…' : 'Send'}</button>
                    </form>
                    <p className="ns-muted ns-chat__note">“Clear chat” only clears your own view — the admin team keeps the full history.</p>
                  </article>
                </div>
              )}

              {dashboardTab === 'faq' && dashboardRole && dashboardRole !== 'admin' && (
                <div className="ns-dash-grid">
                  <article className="glass ns-dash-card ns-dash-card--wide reveal in">
                    <div className="ns-dash-card__head">
                      <span className="eyebrow">Frequently Asked Questions</span>
                    </div>
                    <div className="ns-faq">
                      {(DASHBOARD_FAQ[dashboardRole] || []).map((item, i) => (
                        <details className="ns-faq__item" key={i}>
                          <summary>{item.q}</summary>
                          <p>{item.a}</p>
                        </details>
                      ))}
                    </div>
                  </article>
                </div>
              )}

              {studentDashboard && (
            <div className="ns-dash-grid">
              <JobOffers role="student" hidden={dashboardTab !== 'overview'} />
              {String(studentDashboard.parent?.link_status || '').toLowerCase() === 'pending_student' && (
                <article className="glass ns-dash-card ns-dash-card--wide reveal in">
                  <div className="ns-dash-card__head">
                    <span className="eyebrow">Parent Confirmation Needed</span>
                  </div>
                  <h3>Is {studentDashboard.parent?.parent_full_name || 'this person'} your parent / guardian?</h3>
                  <p>Someone registered as your parent using your student code. Confirm so your teacher can approve their access — or reject it if you don&apos;t recognise them.</p>
                  <div className="ns-actions">
                    <button className="btn btn--solid" type="button" disabled={busy.startsWith('parent-confirm-')} onClick={() => confirmParent('confirm')}>
                      {busy === 'parent-confirm-confirm' ? 'Saving…' : 'Yes, confirm'}
                    </button>
                    <button className="btn" type="button" disabled={busy.startsWith('parent-confirm-')} onClick={() => confirmParent('reject')}>
                      {busy === 'parent-confirm-reject' ? 'Saving…' : 'No, reject'}
                    </button>
                  </div>
                </article>
              )}
              <article className="glass ns-dash-card reveal in" hidden={dashboardTab !== 'overview'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Student Status</span>
                  <span className="ns-board__badge">{studentDashboard.student.submission_status}</span>
                </div>
                <h3>{studentDashboard.student.full_name}</h3>
                <div className="ns-dashboard-callout">
                  <div className="ns-dashboard-callout__head">
                    <strong>Next milestone</strong>
                    <span>{studentDashboard.can_submit ? 'Ready to submit' : 'Build momentum'}</span>
                  </div>
                  <p>{studentDashboard.can_submit ? 'Your final submission is unlocked. Use the activity tab to send the project.' : 'Complete approvals and interviews to unlock the final project.'}</p>
                </div>
                <div className="ns-progress-block">
                  <div className="ns-progress-block__top">
                    <span>Your progress</span>
                    <strong>{studentStatusProgress}%</strong>
                  </div>
                  <div className="ns-progress-track" aria-hidden="true"><span style={{ width: `${studentStatusProgress}%` }} /></div>
                  {(() => {
                    const next = (studentDashboard.status_tracker || []).find((s: any) => !s.complete)
                    return next
                      ? <p className="ns-progress-next"><strong>Your next step:</strong> {next.label}</p>
                      : <p className="ns-progress-next">🎉 Every step complete — amazing work!</p>
                  })()}
                </div>
                <div className="ns-status-grid">
                  {(studentDashboard.status_tracker || []).map((step: any) => (
                    <div className={`ns-status ${step.complete ? 'is-on' : ''}`} key={step.label}>
                      <strong>{step.label}</strong>
                      <span>{step.complete ? 'Complete' : 'Pending'}</span>
                    </div>
                  ))}
                </div>
                <div className="ns-quick-stats">
                  <div><span>Your ID Number</span><strong>{studentDashboard.student.participant_id}</strong></div>
                  <button type="button" className="is-clickable" onClick={() => onStatClick({ tab: 'activity' })}><span>Can Submit</span><strong>{studentDashboard.can_submit ? 'Yes' : 'Locked'}</strong></button>
                </div>
                <div className="ns-qr-card">
                  <img src={qrImageSrc(studentDashboard.student.qr_url)} alt="Student QR code" />
                  <div>
                    <strong>Parent Consent QR</strong>
                    <p>Share this code so the parent can open the consent flow on a phone.</p>
                  </div>
                </div>
                <div className="ns-actions">
                  <button className="btn btn--sm" type="button" onClick={() => { void navigator.clipboard.writeText(String(studentDashboard.student.participant_id || '')); showNotice('success', 'ID Number copied') }}>Copy ID</button>
                  <button className="btn btn--sm" type="button" onClick={() => openDashboardTab('activity')}>Open My Work</button>
                  <button className="btn btn--sm" type="button" onClick={() => openDashboardTab('profile')}>View Profile</button>
                  <button className="btn btn--sm btn--solid" type="button" onClick={() => openDashboardTab('rankings')}>View Rankings</button>
                </div>
              </article>

              {studentDashboard.referral?.code && (() => {
                const refLink = `${window.location.origin}/new-school?ref=${studentDashboard.referral.code}`
                return (
                  <article className="glass ns-dash-card reveal in ns-referral-card" hidden={dashboardTab !== 'overview'}>
                    <div className="ns-dash-card__head"><span className="eyebrow">Invite Friends · Earn Points</span></div>
                    <p className="ns-referral-card__intro">Share your link. When a friend joins and gets approved by their teacher, you earn <strong>10 points</strong> — and climb the leaderboard. 🚀</p>
                    <div className="ns-referral-card__row">
                      <input readOnly value={refLink} onFocus={(e) => e.currentTarget.select()} aria-label="Your referral link" />
                      <button className="btn btn--sm btn--solid" type="button" onClick={() => { void navigator.clipboard.writeText(refLink); showNotice('success', 'Referral link copied!') }}>Copy</button>
                    </div>
                    <div className="ns-referral-card__stats">
                      <div><span>Friends joined</span><strong>{studentDashboard.referral.count || 0}</strong></div>
                      <div><span>Points earned</span><strong>{studentDashboard.referral.points || 0}</strong></div>
                    </div>
                    <div className="ns-qr-card">
                      <img src={qrImageSrc(refLink)} alt="Referral QR code" />
                      <div><strong>Scan to join</strong><p>Friends can scan this to register under your invite.</p></div>
                    </div>
                  </article>
                )
              })()}

              {dashboardTab === 'profile' && (<><ProfilePhotoCard /><ChangePasswordCard /></>)}

              <article className="glass ns-dash-card reveal in" hidden={dashboardTab !== 'profile'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Approvals</span>
                  <span className="ns-board__badge">Parent / School / Teacher</span>
                </div>
                <div className="ns-approval-stack">
                  <div className="ns-approval-row"><strong>Parent</strong><span>{studentDashboard.student.parent_consent_status}</span></div>
                  <div className="ns-approval-row"><strong>School</strong><span>{studentDashboard.student.school_approval_status}</span></div>
                  <div className="ns-approval-row"><strong>Teacher</strong><span>{studentDashboard.student.teacher_approval_status}</span></div>
                  <div className="ns-approval-row"><strong>Submission</strong><span>{studentDashboard.student.submission_status}</span></div>
                </div>
              </article>

              <article className="glass ns-dash-card reveal in" hidden={dashboardTab !== 'profile'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Winner Status</span>
                  <span className="ns-board__badge">{studentDashboard.winner ? studentDashboard.winner.place : 'Pending'}</span>
                </div>
                {studentDashboard.winner ? (
                  <div className="ns-award">
                    <div className="ns-award__head">
                      <strong>{studentDashboard.winner.place} place</strong>
                      <span>{formatMoney(studentDashboard.winner.scholarship_amount)}</span>
                    </div>
                    <p>{studentDashboard.winner.announced_at || studentDashboard.winner.published_at || 'Published on the site.'}</p>
                  </div>
                ) : (
                  <p className="ns-muted">No winner announcement has been published for this student yet.</p>
                )}
              </article>

              <article className="glass ns-dash-card reveal in" hidden={dashboardTab !== 'profile'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">About</span>
                  <span className="ns-board__badge">{studentDashboard.student.grade_level || 'Student'}</span>
                </div>
                <div className="ns-approval-stack">
                  <div className="ns-approval-row"><strong>School</strong><span>{studentDashboard.school?.school_name || studentDashboard.student.school_name || '-'}</span></div>
                  <div className="ns-approval-row"><strong>Teacher</strong><span>{studentDashboard.teacher?.teacher_full_name || '-'}</span></div>
                  <div className="ns-approval-row"><strong>Scholarship</strong><span>{formatMoney(studentDashboard.winner?.scholarship_amount || 0)}</span></div>
                  <div className="ns-approval-row"><strong>Performance Score</strong><span>{studentDashboard.performance_score || 0}</span></div>
                </div>
                <p className="ns-muted">This tab is your student profile overview. It shows your school link, teacher link, and scholarship progress.</p>
              </article>

              <article className="glass ns-dash-card ns-dash-card--wide reveal in ns-leaderboard-card" hidden={dashboardTab !== 'rankings'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Competition Leaderboard</span>
                  <span className="ns-board__badge">🏆 School #{studentDashboard.rankings?.school?.position || '-'} · Class #{studentDashboard.rankings?.teacher?.position || '-'}</span>
                </div>
                <p className="ns-leaderboard-tagline">
                  Every interview, approval and submission earns points. See where you stand and keep climbing toward the podium.
                </p>

                <div className="ns-record-tabs" role="tablist" aria-label="Leaderboard view">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={studentRankTab === 'school'}
                    className={`ns-record-tabs__btn ${studentRankTab === 'school' ? 'is-active' : ''}`}
                    onClick={() => setStudentRankTab('school')}
                  >
                    <strong>School Board</strong>
                    <span>Everyone school-wide</span>
                    <em>{studentSchoolRankings.length}</em>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={studentRankTab === 'class'}
                    className={`ns-record-tabs__btn ${studentRankTab === 'class' ? 'is-active' : ''}`}
                    onClick={() => setStudentRankTab('class')}
                  >
                    <strong>Class Board</strong>
                    <span>Your teacher&apos;s class</span>
                    <em>{studentTeacherRankings.length}</em>
                  </button>
                </div>

                {studentLeaderRows.length === 0 ? (
                  <p className="ns-muted" style={{ marginTop: 16 }}>No ranked students yet — standings appear once scores are recorded.</p>
                ) : (
                  <>
                    {studentPodium.length > 0 && (
                      <div className="ns-podium" aria-label="Top performers">
                        {studentPodium.map((pdm) => (
                          <div key={`spodium-${pdm.id}`} className={`ns-podium__place ${pdm.isMe ? 'is-me' : ''}`} data-rank={pdm.rank}>
                            <span className="ns-podium__medal" aria-hidden="true">{['🥇', '🥈', '🥉'][pdm.rank - 1] || `#${pdm.rank}`}</span>
                            <span className="ns-podium__avatar">{avatarInner(pdm.name, pdm.avatar)}</span>
                            <strong className="ns-podium__name">{pdm.name}{pdm.isMe ? ' (you)' : ''}</strong>
                            <span className="ns-podium__sub">{pdm.sub}</span>
                            <span className="ns-podium__score">{pdm.score}<small>pts</small></span>
                            <span className="ns-podium__pedestal">{pdm.rank}</span>
                          </div>
                        ))}
                      </div>
                                  )}

                    <div className="ns-leaderboard" role="list">
                      <div className="ns-leaderboard__head" aria-hidden="true">
                        <span>Rank</span>
                        <span />
                        <span>Student</span>
                        <span>Points</span>
                        <span>Status</span>
                      </div>
                      {studentLeaderRows.map((r) => (
                        <div
                          role="listitem"
                          key={`sleader-${r.id}`}
                          className={`ns-leader-row ${r.rank >= 1 && r.rank <= 3 ? 'is-podium' : ''} ${r.isMe ? 'is-me' : ''}`}
                          data-rank={r.rank}
                        >
                          <span className="ns-leader-rank">{r.rank >= 1 && r.rank <= 3 ? (['🥇', '🥈', '🥉'][r.rank - 1]) : (r.rank || '—')}</span>
                          <span className="ns-leader-avatar" aria-hidden="true">{avatarInner(r.name, r.avatar)}</span>
                          <div className="ns-leader-id">
                            <strong>{r.name}{r.isMe ? ' (you)' : ''}</strong>
                            <span>{r.sub}</span>
                          </div>
                          <div className="ns-leader-score">
                            <div className="ns-leader-bar"><span style={{ width: `${Math.max(6, Math.round((r.score / studentLeaderMax) * 100))}%` }} /></div>
                            <strong>{r.score}<small>pts</small></strong>
                          </div>
                          <span className="ns-status-pill" data-status={String(r.tag).toLowerCase()}>{r.tag}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </article>

              <SchoolRankBoard schools={schoolRankings} mySchoolId={myDashboardSchoolId} hidden={dashboardTab !== 'rankings' && dashboardTab !== 'overview'} />

              <article className="glass ns-dash-card reveal in" hidden={dashboardTab !== 'notifications'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Notifications</span>
                  <span className="ns-board__badge">{studentUnreadNotifications.length} unread</span>
                </div>
                <div className="ns-notification-list">
                  {studentNotifications.length > 0 ? studentNotifications.slice(0, 6).map((item: any) => (
                    <div className={`ns-notification-item ${item.is_read ? '' : 'is-unread'}`} key={item.id}>
                      <strong>{item.title}</strong>
                      <p>{item.message}</p>
                      <span>{item.created_at}</span>
                      {!item.is_read && (
                        <button className="ns-notification-action" type="button" disabled={busy === `notif-${item.id}`} onClick={() => markNotificationRead(item.id)}>
                          Mark as read
                        </button>
                                    )}
                    </div>
                  )) : <p className="ns-muted">No student notifications yet.</p>}
                </div>
              </article>

              {dashboardTab === 'activity' && !studentDashboard.scholarship?.completed && (
                <ScholarshipWizard
                  initialAnswers={studentDashboard.scholarship?.answers || []}
                  busy={scholarshipBusy}
                  onComplete={saveScholarship}
                />
              )}

              <article className="glass ns-dash-card ns-dash-card--wide reveal in" hidden={dashboardTab !== 'activity' || !studentDashboard.scholarship?.completed}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Your Previous Work</span>
                  <span className="ns-board__badge">{studentDashboard.interview_count} / 10 interviews</span>
                </div>
                <p className="ns-muted" style={{ marginTop: 0 }}>Tap any card below to read your full submission.</p>
                <div className="ns-interview-grid">
                  {(studentDashboard.interviews || []).length === 0 && (
                    <p className="ns-muted">No interviews yet. Use the form below to add your first business.</p>
                                )}
                  {(studentDashboard.interviews || []).map((row: any) => (
                    <button type="button" className="ns-interview is-clickable" key={row.id} onClick={() => setRecordDetail({ kind: 'interview', record: row })}>
                      <strong>Visit {row.visit_number}</strong>
                      <span>{row.business_name}</span>
                      <p>{row.business_category}</p>
                      <small>{row.date_of_visit}</small>
                    </button>
                  ))}
                </div>
                {studentDashboard.submission && (
                  <div className="ns-prevwork-project">
                    <span className="ns-overview-label">Your Final Project</span>
                    <button type="button" className="ns-prevwork-project__card is-clickable" onClick={() => setRecordDetail({ kind: 'project', record: studentDashboard.submission })}>
                      <div>
                        <strong>{studentDashboard.submission.problem_identified ? String(studentDashboard.submission.problem_identified).slice(0, 70) : 'Project submission'}</strong>
                        <span>Status: {studentDashboard.submission.status} · tap to read</span>
                      </div>
                      <span aria-hidden="true">→</span>
                    </button>
                  </div>
                )}
              </article>

              <article className="glass ns-dash-card ns-dash-card--wide reveal in" hidden={dashboardTab !== 'activity'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Dashboard Points</span>
                  <span className="ns-board__badge">{studentDashboard.student_points || 0} pts</span>
                </div>
                <div className="ns-approval-stack">
                  {((studentDashboard.automatic_breakdown as any[]) || []).map((b: any) => (
                    <div className="ns-approval-row" key={b.key}><strong>{b.label}</strong><span>{b.points} / {b.max}</span></div>
                  ))}
                  {!!studentDashboard.admin_bonus && <div className="ns-approval-row"><strong>Admin Bonus</strong><span>+{studentDashboard.admin_bonus}</span></div>}
                  <div className="ns-approval-row"><strong>Total</strong><span>{studentDashboard.student_points || 0}</span></div>
                </div>
                <p className="ns-muted">Points update automatically as you complete each step. Judge scores are added separately after judging.</p>
              </article>

              {studentDashboard.results_published && studentDashboard.judge_result && (
                <article className="glass ns-dash-card ns-dash-card--wide reveal in" hidden={dashboardTab !== 'activity'}>
                  <div className="ns-dash-card__head">
                    <span className="eyebrow">Final Results</span>
                    <span className="ns-board__badge">{studentDashboard.judge_result.final} pts</span>
                  </div>
                  <div className="ns-approval-stack">
                    <div className="ns-approval-row"><strong>Automatic Dashboard Points</strong><span>{studentDashboard.judge_result.automatic}</span></div>
                    <div className="ns-approval-row"><strong>Average Judge Score</strong><span>{studentDashboard.judge_result.judge_average ?? '—'} / 135</span></div>
                    <div className="ns-approval-row"><strong>Final Competition Score</strong><span>{studentDashboard.judge_result.final}</span></div>
                  </div>
                  <p className="ns-muted">Judging is complete. Your final score = automatic points + average judge score.</p>
                </article>
              )}

              <article className="glass ns-dash-card ns-dash-card--wide reveal in" id="supporting-materials" hidden={dashboardTab !== 'activity' || !studentDashboard.scholarship?.completed}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Supporting Materials</span>
                  <span className="ns-board__badge">+5 each · max 30</span>
                </div>
                <p className="ns-muted" style={{ margin: '0 0 10px' }}>Upload each item below (image or PDF, max 5 MB). These appear to the judges as evidence for your project.</p>
                <div className="ns-approval-stack">
                  {((studentDashboard.material_types as any[]) || []).map((mt: any) => {
                    const existing = ((studentDashboard.supporting_materials as any[]) || []).find((m: any) => m.material_type === mt.key)
                    const rowBusy = busy === `material-${mt.key}`
                    return (
                      <div className="ns-approval-row" key={mt.key}>
                        <strong>{mt.label}</strong>
                        {existing ? (
                          <span><a href={existing.file_url} target="_blank" rel="noreferrer">View</a>{' · '}
                            <button type="button" style={{ background: 'none', border: 0, color: '#e08a8a', cursor: 'pointer', font: 'inherit' }} disabled={busy === `material-${existing.id}`} onClick={() => removeMaterial(existing.id)}>Remove</button>
                          </span>
                        ) : (
                          <label className="btn btn--sm btn--solid" style={{ cursor: rowBusy ? 'default' : 'pointer', opacity: rowBusy ? 0.6 : 1 }}>
                            {rowBusy ? 'Uploading…' : 'Upload file'}
                            <input type="file" accept="image/*,application/pdf" hidden disabled={rowBusy}
                              onChange={(e) => { const f = e.target.files?.[0] || null; e.target.value = ''; uploadMaterialType(mt.key, f) }} />
                          </label>
                        )}
                      </div>
                    )
                  })}
                </div>
              </article>

              {studentDashboard.submissions_open === false && dashboardTab === 'activity' && studentDashboard.scholarship?.completed && (
                <div className="ns-alert ns-alert--info reveal in" hidden={dashboardTab !== 'activity'}>
                  ⏳ The challenge deadline{studentDashboard.submission_deadline ? ` (${formatDateLabel(studentDashboard.submission_deadline)})` : ''} has passed. Your dashboard stays open, but <strong>new business interviews and project submissions are now closed</strong>.
                </div>
              )}

              <form className="glass ns-form ns-form--compact reveal in" id="business-interviews" onSubmit={submitBusiness} hidden={dashboardTab !== 'activity' || !studentDashboard.scholarship?.completed}>
                <div className="ns-form__head">
                  <span className="eyebrow">Business Entry</span>
                  <h3>Log a local business</h3>
                  <p>Students add 10 businesses before the final submission unlocks.</p>
                </div>
                <div className="ns-field-grid">
                  <label className="ns-field"><span>Visit Number</span><input name="visit_number" type="number" min="1" max="10" placeholder="Auto if blank" /></label>
                  <label className="ns-field"><span>Business Name</span><input name="business_name" required minLength={3} placeholder="At least 3 characters" /></label>
                  <label className="ns-field"><span>Owner / Manager</span><input name="owner_name" required minLength={3} /></label>
                  <label className="ns-field"><span>Phone Number</span><input name="business_phone" type="tel" inputMode="numeric" required minLength={7} /></label>
                  <label className="ns-field"><span>Business Address</span><input name="business_address" required minLength={3} /></label>
                  <label className="ns-field"><span>Category</span><input name="business_category" required minLength={3} /></label>
                  <label className="ns-field"><span>Business Website <small className="ns-field-hint">(optional — helps the business find your visit)</small></span><input name="business_website" type="url" placeholder="https://…" /></label>
                  <label className="ns-field"><span>Date of Visit</span><input name="date_of_visit" type="date" required min={String(studentDashboard.student?.created_at || '').slice(0, 10) || undefined} max={todayInputDate()} /></label>
                  <label className="ns-field ns-field--full"><span>Main Challenge <small className="ns-field-hint">50–500 words</small></span><textarea name="main_challenge" rows={3} required placeholder="Describe the main challenge this business faces (50–500 words)." /></label>
                  <label className="ns-field ns-field--full"><span>Student Notes <small className="ns-field-hint">50–500 words</small></span><textarea name="student_notes" rows={3} required placeholder="Your observations and notes from the visit (50–500 words)." /></label>
                  <label className="ns-field ns-field--full"><span>Signature <small className="ns-field-hint">Type the business owner / manager name to verify this visit — earns 10 points</small></span><input name="signature" placeholder="Owner / manager signature" /></label>
                </div>
                <p className="ns-check-hint">Tick every option this business already has — leave it unticked if they don’t:</p>
                <div className="ns-check-grid">
                  {[
                    ['has_website', 'Website'],
                    ['has_google_profile', 'Google Business Profile'],
                    ['uses_social_media', 'Social Media'],
                    ['uses_digital_signage', 'Digital Signage'],
                    ['offers_rewards', 'Coupons / Rewards'],
                    ['has_online_ordering', 'Online Ordering'],
                    ['has_delivery_options', 'Delivery Options'],
                  ].map(([name, label]) => (
                    <label className="ns-check" key={name}>
                      <input name={name} type="checkbox" />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                <TermsAgreement kind="website" idPrefix="ns-business" hideSignature signatureName="" onSignatureChange={() => {}} onAcceptedChange={setBusinessTermsOk} />
                <button className="btn btn--solid" type="submit" disabled={busy === 'business' || !businessTermsOk || studentDashboard.submissions_open === false}>{busy === 'business' ? 'Saving...' : studentDashboard.submissions_open === false ? 'Deadline passed' : 'Save Business Interview'}</button>
              </form>

              <form className="glass ns-form ns-form--compact reveal in" id="final-submission" onSubmit={submitSubmission} hidden={dashboardTab !== 'activity' || !studentDashboard.scholarship?.completed}>
                <div className="ns-form__head">
                  <span className="eyebrow">Problem &amp; Solution Submission</span>
                  <h3>Video and written upload</h3>
                  <p>Unlocked after approvals and the 10 required interviews are complete.</p>
                </div>
                {studentDashboard.submission && String(studentDashboard.submission.status || '').toLowerCase() !== 'draft' ? (
                  <>
                    <div className="ns-alert ns-alert--info">Your final project has been submitted. Submissions are <strong>one-time only</strong> and can’t be changed.</div>
                    <div className="ns-submission-summary">
                      <strong>Status: {studentDashboard.submission.status}</strong>
                      <p>{studentDashboard.submission.problem_identified}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="ns-field-grid">
                      <label className="ns-field">
                        <span>Selected Business</span>
                        <select name="source_business_id" defaultValue={selectedBusinessId || ''}>
                          <option value="">Choose a business</option>
                          {(studentDashboard.interviews || []).map((row: any) => (
                            <option key={row.id} value={row.id}>{`Visit ${row.visit_number}: ${row.business_name}`}</option>
                          ))}
                        </select>
                      </label>
                      <label className="ns-field ns-field--full"><span>Problem Identified <small className="ns-field-hint">50–500 words</small></span><textarea name="problem_identified" rows={3} required placeholder="What community problem did you find? (50–500 words)" /></label>
                      <label className="ns-field ns-field--full"><span>Why It Matters <small className="ns-field-hint">50–500 words</small></span><textarea name="why_it_matters" rows={3} required placeholder="(50–500 words)" /></label>
                      <label className="ns-field ns-field--full"><span>Proposed Solution <small className="ns-field-hint">50–500 words</small></span><textarea name="proposed_solution" rows={3} required placeholder="(50–500 words)" /></label>
                      <label className="ns-field ns-field--full"><span>How It Helps <small className="ns-field-hint">50–500 words</small></span><textarea name="how_it_helps" rows={3} required placeholder="(50–500 words)" /></label>
                      <label className="ns-field ns-field--full"><span>Expected Impact <small className="ns-field-hint">50–500 words</small></span><textarea name="expected_impact" rows={3} required placeholder="(50–500 words)" /></label>
                      <label className="ns-field ns-field--full"><span>Video Upload <small className="ns-field-hint">Video only · max 70 MB</small></span><input name="video_file" type="file" accept="video/mp4,video/webm,video/quicktime,video/x-matroska" required /></label>
                      <label className="ns-field ns-field--full"><span>Written Upload <small className="ns-field-hint">Image or PDF · max 5 MB</small></span><input name="written_file" type="file" accept="image/*,application/pdf" required /></label>
                      <label className="ns-field ns-field--full"><span>AI Demonstration <small className="ns-field-hint">Optional · +10 bonus · show responsible AI use</small></span><textarea name="ai_note" rows={2} placeholder="Describe how you used AI responsibly (optional)." /></label>
                      <label className="ns-field ns-field--full"><span>AI Upload <small className="ns-field-hint">Optional · image or PDF · max 5 MB</small></span><input name="ai_file" type="file" accept="image/*,application/pdf" /></label>
                      <label className="ns-field ns-field--full"><span>Community Service <small className="ns-field-hint">Optional · +10 bonus · extra community work</small></span><textarea name="community_note" rows={2} placeholder="Describe additional community improvement work (optional)." /></label>
                      <label className="ns-field ns-field--full"><span>Community Service Upload <small className="ns-field-hint">Optional · image or PDF · max 5 MB</small></span><input name="community_file" type="file" accept="image/*,application/pdf" /></label>
                    </div>
                    {!canStudentSubmit && (studentDashboard.submissions_open === false
                      ? <div className="ns-alert ns-alert--info">The challenge deadline has passed — final project submissions are closed.</div>
                      : <div className="ns-alert ns-alert--info">Final submission stays locked until parent consent, teacher approval, and 10 business interviews are complete.</div>)}
                    <TermsAgreement kind="website" idPrefix="ns-submission" hideSignature signatureName="" onSignatureChange={() => {}} onAcceptedChange={setSubmissionTermsOk} />
                    <p className="ns-check-hint">Heads up — your final project can be submitted only once and can’t be edited afterward.</p>
                    <button className="btn btn--solid" type="submit" disabled={busy === 'submission' || !canStudentSubmit || !submissionTermsOk}>
                      {busy === 'submission' ? 'Saving...' : 'Submit Final Project'}
                    </button>
                  </>
                )}
              </form>
            </div>
              )}

              {parentDashboard && (
            <div className="ns-dash-grid">
              <JobOffers role="parent" hidden={dashboardTab !== 'overview'} />
              <article className="glass ns-dash-card reveal in">
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Parent Dashboard</span>
                  <span className="ns-board__badge">Consent approved</span>
                </div>
                <h3>{parentDashboard.parent.parent_full_name}</h3>
                <p>Linked student: {parentDashboard.parent.student_full_name}</p>
                <div className="ns-dashboard-callout">
                  <div className="ns-dashboard-callout__head">
                    <strong>Monitoring mode</strong>
                    <span>{parentDashboard.student_context?.student?.submission_status || 'tracking'}</span>
                  </div>
                  <p>Watch approvals, rank movement, and scholarship progress without editing anything.</p>
                </div>
                <div className="ns-approval-stack">
                  <div className="ns-approval-row"><strong>Parent consent</strong><span>{parentDashboard.student_context?.student?.parent_consent_status || 'pending'}</span></div>
                  <div className="ns-approval-row"><strong>Approval</strong><span>{parentDashboard.student_context?.student?.teacher_approval_status || 'pending'}</span></div>
                  <div className="ns-approval-row"><strong>Submission</strong><span>{parentDashboard.student_context?.student?.submission_status || 'locked'}</span></div>
                </div>
                <div className="ns-actions">
                  <button className="btn btn--sm" type="button" onClick={() => openDashboardTab('profile')}>View Profile</button>
                  <button className="btn btn--sm btn--solid" type="button" onClick={() => openDashboardTab('rankings')}>View Rankings</button>
                  <button className="btn btn--sm" type="button" onClick={() => openDashboardTab('notifications')}>Open Alerts</button>
                </div>
              </article>
              {dashboardTab === 'profile' && (<><ProfilePhotoCard /><ChangePasswordCard /></>)}
              <article className="glass ns-dash-card reveal in" hidden={dashboardTab !== 'profile'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Profile</span>
                  <span className="ns-board__badge">{parentDashboard.student_context?.student?.participant_id || '-'}</span>
                </div>
                <div className="ns-approval-stack">
                  <div className="ns-approval-row"><strong>Relationship</strong><span>{parentDashboard.parent.relationship_to_student}</span></div>
                  <div className="ns-approval-row"><strong>Phone</strong><span>{parentDashboard.parent.phone_number}</span></div>
                  <div className="ns-approval-row"><strong>Email</strong><span>{parentDashboard.parent.email}</span></div>
                  <div className="ns-approval-row"><strong>Student School</strong><span>{parentDashboard.parent.student_school_name}</span></div>
                </div>
                <p className="ns-muted">This tab keeps the linked student context in one place and stays out of the way while you monitor progress.</p>
              </article>
              <article className="glass ns-dash-card reveal in" hidden={dashboardTab !== 'rankings'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Your Ranking</span>
                  <span className="ns-board__badge">{parentDashboard.student_context?.final_score ?? parentDashboard.student_context?.student_points ?? 0} pts</span>
                </div>
                <div className="ns-approval-stack">
                  <div className="ns-approval-row"><strong>School Rank</strong><span>#{parentDashboard.student_context?.rankings?.school?.position || '-'}</span></div>
                  <div className="ns-approval-row"><strong>Teacher Rank</strong><span>#{parentDashboard.student_context?.rankings?.teacher?.position || '-'}</span></div>
                  <div className="ns-approval-row"><strong>Scholarship</strong><span>{formatMoney(parentDashboard.student_context?.winner?.scholarship_amount || 0)}</span></div>
                  <div className="ns-approval-row"><strong>Participant ID</strong><span>{parentDashboard.student_context?.student?.participant_id || '-'}</span></div>
                </div>
              </article>
              <SchoolRankBoard schools={schoolRankings} mySchoolId={myDashboardSchoolId} hidden={dashboardTab !== 'rankings' && dashboardTab !== 'overview'} />
              <article className="glass ns-dash-card reveal in" hidden={dashboardTab !== 'notifications'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Notifications</span>
                  <span className="ns-board__badge">{parentUnreadNotifications.length} unread</span>
                </div>
                <div className="ns-notification-list">
                  {parentNotifications.length > 0 ? parentNotifications.slice(0, 6).map((item: any) => (
                    <div className={`ns-notification-item ${item.is_read ? '' : 'is-unread'}`} key={item.id}>
                      <strong>{item.title}</strong>
                      <p>{item.message}</p>
                      <span>{item.created_at}</span>
                      {!item.is_read && (
                        <button className="ns-notification-action" type="button" disabled={busy === `notif-${item.id}`} onClick={() => markNotificationRead(item.id)}>
                          Mark as read
                        </button>
                                    )}
                    </div>
                  )) : <p className="ns-muted">No parent notifications yet.</p>}
                </div>
              </article>
            </div>
              )}

              {isManagerLayout && (
            <div className="ns-dash-grid">
              <article className="glass ns-dash-card ns-dash-card--wide reveal in" hidden={dashboardTab !== 'overview'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">{schoolDashboard ? 'School Dashboard' : 'Teacher Dashboard'}</span>
                  <span className="ns-board__badge">{schoolDashboard ? schoolDashboard.school.school_name : (teacherDashboard?.teacher?.teacher_full_name || 'Class')}</span>
                </div>
                <div className="ns-dashboard-callout">
                  <div className="ns-dashboard-callout__head">
                    <strong>{schoolDashboard ? 'School Tools' : 'Class Tools'}</strong>
                    <span>{activeSummary.submitted || 0} submissions</span>
                  </div>
                  <p>{schoolDashboard
                    ? 'Approve teachers and see how your school is doing.'
                    : 'Approve your students and check their work.'}</p>
                </div>
                <span className="ns-overview-label">Approval pipeline · tap a card to open it</span>
                <div className="ns-quick-stats">
                  <button type="button" className="is-clickable" onClick={() => onStatClick({ tab: 'approvals', approvalsTab: 'students', filter: 'pending' })}><span>Students Waiting</span><strong>{activeSummary.teacher_pending || 0}</strong></button>
                  <button type="button" className="is-clickable" onClick={() => onStatClick({ tab: 'approvals', approvalsTab: 'students', filter: 'approved' })}><span>Students Approved</span><strong>{activeSummary.teacher_approved || 0}</strong></button>
                  {activeManagesTeachers && (
                    <>
                      <button type="button" className="is-clickable" onClick={() => onStatClick({ tab: 'approvals', approvalsTab: 'teachers', filter: 'pending' })}><span>Teachers Waiting</span><strong>{activeTeachers.filter((t: any) => { const s = String(t.status || 'registered').toLowerCase(); return s !== 'approved' && s !== 'rejected' }).length}</strong></button>
                      <button type="button" className="is-clickable" onClick={() => onStatClick({ tab: 'approvals', approvalsTab: 'teachers', filter: 'approved' })}><span>Teachers Approved</span><strong>{activeTeachers.filter((t: any) => String(t.status || '').toLowerCase() === 'approved').length}</strong></button>
                    </>
                                )}
                  {teacherDashboard && (
                    <button type="button" className="is-clickable" onClick={() => onStatClick({ tab: 'approvals', approvalsTab: 'parents', filter: 'pending' })}><span>Parents Waiting</span><strong>{activeParents.filter((p: any) => String(p.link_status || '').toLowerCase() === 'pending_teacher').length}</strong></button>
                                )}
                  <button type="button" className="is-clickable" onClick={() => onStatClick({ tab: 'records' })}><span>Interviews Logged</span><strong>{activeSummary.interviews_total || 0}</strong></button>
                </div>
                <div className="ns-actions">
                  <button className="btn btn--sm" type="button" onClick={() => openDashboardTab('profile')}>View Profile</button>
                  <button className="btn btn--sm btn--solid" type="button" onClick={() => openDashboardTab('approvals')}>Manage Approvals</button>
                  <button className="btn btn--sm" type="button" onClick={() => openDashboardTab('rankings')}>Open Rankings</button>
                  <button className="btn btn--sm" type="button" onClick={() => openDashboardTab('records')}>View Records</button>
                </div>
              </article>

              {dashboardTab === 'profile' && (<><ProfilePhotoCard /><ChangePasswordCard /></>)}
              <article className="glass ns-dash-card reveal in" hidden={dashboardTab !== 'profile'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">{schoolDashboard ? 'School Profile' : 'Teacher Profile'}</span>
                  <span className="ns-board__badge">{schoolDashboard ? (schoolDashboard.school.status || 'registered') : (teacherDashboard?.teacher?.status || 'active')}</span>
                </div>
                {schoolDashboard ? (
                  <div className="ns-approval-stack">
                    <div className="ns-approval-row"><strong>Principal</strong><span>{schoolDashboard.school.principal_name || '-'}</span></div>
                    <div className="ns-approval-row"><strong>Administrator</strong><span>{schoolDashboard.school.administrator_name || '-'}</span></div>
                    <div className="ns-approval-row"><strong>District</strong><span>{schoolDashboard.school.school_district || '-'}</span></div>
                    <div className="ns-approval-row"><strong>School Email</strong><span>{currentSchoolEmail || '-'}</span></div>
                    <div className="ns-approval-row"><strong>Main Phone</strong><span>{schoolDashboard.school.main_phone || '-'}</span></div>
                  </div>
                ) : (
                  <div className="ns-approval-stack">
                    <div className="ns-approval-row"><strong>Teacher</strong><span>{teacherDashboard?.teacher?.teacher_full_name || '-'}</span></div>
                    <div className="ns-approval-row"><strong>School</strong><span>{teacherDashboard?.school?.school_name || teacherDashboard?.teacher?.linked_school_name || '-'}</span></div>
                    <div className="ns-approval-row"><strong>Email</strong><span>{teacherDashboard?.teacher?.school_email || user?.email || '-'}</span></div>
                    <div className="ns-approval-row"><strong>Department</strong><span>{teacherDashboard?.teacher?.role_department || 'Teacher'}</span></div>
                    <div className="ns-approval-row"><strong>Grades</strong><span>{teacherDashboard?.teacher?.grade_level_supported || '-'}</span></div>
                  </div>
                )}
              </article>
              <article className="glass ns-dash-card ns-dash-card--wide reveal in" hidden={dashboardTab !== 'approvals'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Approvals</span>
                  <span className="ns-board__badge">
                    {schoolApprovalsTab === 'students'
                      ? `${filteredApprovalStudents.length} students`
                      : `${filteredApprovalTeachers.length} teachers`}
                  </span>
                </div>

                <div className="ns-record-tabs" role="tablist" aria-label="Approval sections">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={schoolApprovalsTab === 'students'}
                    className={`ns-record-tabs__btn ${schoolApprovalsTab === 'students' ? 'is-active' : ''}`}
                    onClick={() => setSchoolApprovalsTab('students')}
                  >
                    <strong>Students</strong>
                    <span>Approve participation</span>
                    <em>{activeStudents.length}</em>
                  </button>
                  {activeManagesTeachers && (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={schoolApprovalsTab === 'teachers'}
                      className={`ns-record-tabs__btn ${schoolApprovalsTab === 'teachers' ? 'is-active' : ''}`}
                      onClick={() => setSchoolApprovalsTab('teachers')}
                    >
                      <strong>Teachers</strong>
                      <span>Verification</span>
                      <em>{activeTeachers.length}</em>
                    </button>
                                )}
                  {teacherDashboard && (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={schoolApprovalsTab === 'parents'}
                      className={`ns-record-tabs__btn ${schoolApprovalsTab === 'parents' ? 'is-active' : ''}`}
                      onClick={() => setSchoolApprovalsTab('parents')}
                    >
                      <strong>Parent Approvals</strong>
                      <span>Verify &amp; approve</span>
                      <em>{activeParents.filter((p: any) => String(p.link_status || '').toLowerCase() === 'pending_teacher').length}</em>
                    </button>
                                )}
                </div>

                <div className="ns-approvals-toolbar">
                  <label className="ns-approvals-search">
                    <span aria-hidden="true">⌕</span>
                    <input
                      type="search"
                      value={schoolApprovalSearch}
                      onChange={(event) => setSchoolApprovalSearch(event.target.value)}
                      placeholder={schoolApprovalsTab === 'students' ? 'Search student or participant ID' : 'Search teacher or department'}
                      aria-label="Search approvals"
                    />
                  </label>
                  <div className="ns-approvals-filter" role="group" aria-label="Filter by status">
                    {approvalStatusOptions.map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        className={`ns-approvals-filter__btn ${schoolApprovalStatus === option.key ? 'is-active' : ''}`}
                        onClick={() => setSchoolApprovalStatus(option.key)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {schoolApprovalsTab === 'students' && (
                  <PagedRows items={filteredApprovalStudents}>{(rows) => (
                  <div className="ns-table-wrap">
                    <table className="ns-table ns-table--approvals">
                      <thead>
                        <tr>
                          <th>Participant</th>
                          <th>Student</th>
                          <th>Parent</th>
                          <th>Approval</th>
                          <th className="ns-col-actions">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredApprovalStudents.length > 0 ? rows.map((row: any) => {
                          const rowBusy = busy.startsWith(`student-${row.id}-`)
                          const st = String(row.teacher_approval_status || 'pending').toLowerCase()
                          return (
                            <tr
                              key={row.id}
                              className="ns-row-clickable"
                              role="button"
                              tabIndex={0}
                              onClick={() => setApprovalDetail({ type: 'student', id: Number(row.id) })}
                              onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setApprovalDetail({ type: 'student', id: Number(row.id) }) } }}
                            >
                              <td>{row.participant_id}</td>
                              <td>{row.full_name}</td>
                              <td><span className="ns-status-pill" data-status={String(row.parent_consent_status || '').toLowerCase()}>{row.parent_consent_status || '—'}</span></td>
                              <td><span className="ns-status-pill" data-status={st}>{row.teacher_approval_status || 'pending'}</span></td>
                              <td className="ns-col-actions">
                                <div className="ns-row-actions">
                                  <button
                                    type="button"
                                    className="ns-row-btn ns-row-btn--approve"
                                    disabled={rowBusy || st === 'approved'}
                                    onClick={(event) => { event.stopPropagation(); approveStudentInline(row, 'approved') }}
                                  >
                                    {busy === `student-${row.id}-approved` ? '…' : st === 'approved' ? 'Approved' : 'Approve'}
                                  </button>
                                  <button
                                    type="button"
                                    className="ns-row-btn ns-row-btn--reject"
                                    disabled={rowBusy || st === 'rejected'}
                                    onClick={(event) => { event.stopPropagation(); approveStudentInline(row, 'rejected') }}
                                  >
                                    {busy === `student-${row.id}-rejected` ? '…' : st === 'rejected' ? 'Rejected' : 'Reject'}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        }) : (
                          <tr><td colSpan={5}>No students match this search or filter.</td></tr>
                                      )}
                      </tbody>
                    </table>
                  </div>
                                )}</PagedRows>
                )}

                {schoolApprovalsTab === 'teachers' && (
                  <PagedRows items={filteredApprovalTeachers}>{(rows) => (
                  <div className="ns-table-wrap">
                    <table className="ns-table ns-table--approvals">
                      <thead>
                        <tr>
                          <th>Teacher</th>
                          <th>Department</th>
                          <th>Students</th>
                          <th>Status</th>
                          <th className="ns-col-actions">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredApprovalTeachers.length > 0 ? rows.map((row: any) => {
                          const rowBusy = busy.startsWith(`teacher-${row.id}-`)
                          const ts = String(row.status || 'registered').toLowerCase()
                          const tsLabel = ts === 'registered' ? 'pending' : ts
                          return (
                            <tr
                              key={row.id}
                              className="ns-row-clickable"
                              role="button"
                              tabIndex={0}
                              onClick={() => setApprovalDetail({ type: 'teacher', id: Number(row.id) })}
                              onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setApprovalDetail({ type: 'teacher', id: Number(row.id) }) } }}
                            >
                              <td>{row.teacher_full_name}</td>
                              <td>{row.role_department || '—'}</td>
                              <td>{row.students_total ?? 0}</td>
                              <td><span className="ns-status-pill" data-status={tsLabel}>{tsLabel}</span></td>
                              <td className="ns-col-actions">
                                <div className="ns-row-actions">
                                  <button
                                    type="button"
                                    className="ns-row-btn ns-row-btn--approve"
                                    disabled={rowBusy || ts === 'approved'}
                                    onClick={(event) => { event.stopPropagation(); approveTeacherInline(row, 'approved') }}
                                  >
                                    {busy === `teacher-${row.id}-approved` ? '…' : ts === 'approved' ? 'Approved' : 'Approve'}
                                  </button>
                                  <button
                                    type="button"
                                    className="ns-row-btn ns-row-btn--reject"
                                    disabled={rowBusy || ts === 'rejected'}
                                    onClick={(event) => { event.stopPropagation(); approveTeacherInline(row, 'rejected') }}
                                  >
                                    {busy === `teacher-${row.id}-rejected` ? '…' : ts === 'rejected' ? 'Rejected' : 'Reject'}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        }) : (
                          <tr><td colSpan={5}>No teachers match this search or filter.</td></tr>
                                      )}
                      </tbody>
                    </table>
                  </div>
                                )}</PagedRows>
                )}

                {schoolApprovalsTab === 'parents' && (
                  <PagedRows items={filteredApprovalParents}>{(rows) => (
                  <div className="ns-table-wrap">
                    <table className="ns-table ns-table--approvals">
                      <thead>
                        <tr>
                          <th>Participant</th>
                          <th>Student</th>
                          <th>Parent</th>
                          <th>Relationship</th>
                          <th>Status</th>
                          <th className="ns-col-actions">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredApprovalParents.length > 0 ? rows.map((row: any) => {
                          const link = String(row.link_status || '').toLowerCase()
                          const canAct = link === 'pending_teacher'
                          const rowBusy = busy.startsWith(`parent-${row.student_id}-`)
                          const statusLabel = link === 'pending_student' ? 'Awaiting student' : link === 'pending_teacher' ? 'Awaiting you' : (row.link_status || '—')
                          return (
                            <tr key={row.id}>
                              <td>{row.participant_id}</td>
                              <td>{row.student_name}</td>
                              <td>{row.parent_full_name}</td>
                              <td>{row.relationship_to_student || '—'}</td>
                              <td><span className="ns-status-pill" data-status={link.startsWith('pending') ? 'pending' : link}>{statusLabel}</span></td>
                              <td className="ns-col-actions">
                                <div className="ns-row-actions">
                                  <button type="button" className="ns-row-btn ns-row-btn--approve" disabled={rowBusy || !canAct} title={canAct ? 'Approve parent' : 'Waiting for the student to confirm first'} onClick={() => approveParentInline(row, 'approved')}>
                                    {busy === `parent-${row.student_id}-approved` ? '…' : 'Approve'}
                                  </button>
                                  <button type="button" className="ns-row-btn ns-row-btn--reject" disabled={rowBusy || !canAct} onClick={() => approveParentInline(row, 'rejected')}>
                                    {busy === `parent-${row.student_id}-rejected` ? '…' : 'Reject'}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        }) : (
                          <tr><td colSpan={6}>No parents are waiting for approval.</td></tr>
                                      )}
                      </tbody>
                    </table>
                  </div>
                                )}</PagedRows>
                )}

                <p className="ns-approvals-note">
                  Actions are signed as <strong>{user?.full_name || 'Reviewer'}</strong>. {teacherDashboard ? 'You approve students directly; parents appear here once the student confirms them.' : 'Approving a student here is the same gate as a teacher’s approval — either one unlocks the student.'}
                </p>
              </article>
              <article className="glass ns-dash-card ns-dash-card--wide reveal in" hidden={dashboardTab !== 'records'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Records</span>
                  <div className="ns-record-head__actions">
                    <span className="ns-board__badge">
                      {schoolRecordsTabs.find((tab) => tab.key === schoolRecordsTab)?.count || 0}
                    </span>
                    {isSchoolLayout && ['students', 'teachers', 'approvals'].includes(schoolRecordsTab) && (
                      <button type="button" className="ns-row-btn ns-row-btn--approve" onClick={() => openRecordCreate(RECORDS_TAB_ENTITY[schoolRecordsTab])}>
                        + Add {RECORD_DEFS[RECORDS_TAB_ENTITY[schoolRecordsTab]].label}
                      </button>
                                  )}
                  </div>
                </div>
                <p className="ns-record-hint">{isTeacherLayout ? 'Tap any row to view its detail card.' : 'Tap any row to open its detail card — edit or delete from there.'}</p>
                <div className="ns-record-tabs" role="tablist" aria-label="School records">
                  {schoolRecordsTabs.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      className={`ns-record-tabs__btn ${schoolRecordsTab === tab.key ? 'is-active' : ''}`}
                      role="tab"
                      aria-selected={schoolRecordsTab === tab.key}
                      onClick={() => setSchoolRecordsTab(tab.key)}
                    >
                      <strong>{tab.label}</strong>
                      <span>{tab.hint}</span>
                      <em>{tab.count}</em>
                    </button>
                  ))}
                </div>
                <div className="ns-record-panel">
                  {schoolRecordsTab === 'students' && (
                    <PagedRows items={activeStudents}>{(rows) => (
                    <div className="ns-table-wrap">
                      <table className="ns-table">
                        <thead>
                          <tr>
                            <th>Participant ID</th>
                            <th>Student</th>
                            <th>Parent</th>
                            <th>School</th>
                            <th>Teacher</th>
                            <th>Interviews</th>
                            <th>Submitted</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeStudents.length > 0 ? rows.map((row: any) => (
                            <tr key={row.id} className="ns-row-clickable" onClick={() => openRecordView('student', Number(row.id))}>
                              <td>{row.participant_id}</td>
                              <td>{row.full_name}</td>
                              <td>{row.parent_consent_status}</td>
                              <td>{row.school_approval_status}</td>
                              <td>{row.teacher_approval_status}</td>
                              <td>
                                <div className="ns-count-cell">
                                  <span>{Number(row.interview_count) || 0}/10</span>
                                  <div className="ns-leader-bar"><span style={{ width: `${Math.min(100, Math.round(((Number(row.interview_count) || 0) / 10) * 100))}%` }} /></div>
                                </div>
                              </td>
                              <td>{Number(row.has_submission) > 0 ? 'Yes' : 'No'}</td>
                              <td>{row.submission_status}</td>
                            </tr>
                          )) : (
                            <tr><td colSpan={8}>No students registered yet.</td></tr>
                                        )}
                        </tbody>
                      </table>
                    </div>
                                  )}</PagedRows>
                                )}

                  {schoolRecordsTab === 'teachers' && (
                    <PagedRows items={activeTeachers}>{(rows) => (
                    <div className="ns-table-wrap">
                      <table className="ns-table">
                        <thead>
                          <tr>
                            <th>Rank</th>
                            <th>Teacher</th>
                            <th>Status</th>
                            <th>Students</th>
                            <th>Score</th>
                            <th>Top Student</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeTeachers.length > 0 ? rows.map((row: any) => (
                            <tr key={row.id} className="ns-row-clickable" onClick={() => openRecordView('teacher', Number(row.id))}>
                              <td>{row.rank_position ?? '-'}</td>
                              <td>{row.teacher_full_name}</td>
                              <td>{row.status}</td>
                              <td>{row.students_total ?? 0}</td>
                              <td>{row.ranking_score ?? 0}</td>
                              <td>{row.top_student_name ? `${row.top_student_name} (${row.top_student_score ?? 0})` : '-'}</td>
                            </tr>
                          )) : (
                            <tr><td colSpan={6}>No teachers registered yet.</td></tr>
                                        )}
                        </tbody>
                      </table>
                    </div>
                                  )}</PagedRows>
                                )}

                  {schoolRecordsTab === 'interviews' && (
                    <PagedRows items={activeBusinesses}>{(rows) => (
                    <div className="ns-table-wrap">
                      <table className="ns-table">
                        <thead>
                          <tr>
                            <th>Participant ID</th>
                            <th>Student</th>
                            <th>Visit</th>
                            <th>Business</th>
                            <th>Category</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeBusinesses.length > 0 ? rows.map((row: any) => (
                            <tr key={row.id} className="ns-row-clickable" onClick={() => openRecordView('interview', Number(row.id))}>
                              <td>{row.participant_id}</td>
                              <td>{row.student_name}</td>
                              <td>{row.visit_number}</td>
                              <td>{row.business_name}</td>
                              <td>{row.business_category}</td>
                            </tr>
                          )) : (
                            <tr><td colSpan={5}>No business interviews recorded yet.</td></tr>
                                        )}
                        </tbody>
                      </table>
                    </div>
                                  )}</PagedRows>
                                )}

                  {schoolRecordsTab === 'approvals' && (
                    <PagedRows items={activeApprovals}>{(rows) => (
                    <div className="ns-table-wrap">
                      <table className="ns-table">
                        <thead>
                          <tr>
                            <th>Participant ID</th>
                            <th>Student</th>
                            <th>Type</th>
                            <th>Status</th>
                            <th>Reviewer</th>
                            <th>Approved At</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeApprovals.length > 0 ? rows.map((row: any) => (
                            <tr key={row.id} className="ns-row-clickable" onClick={() => openRecordView('approval', Number(row.id))}>
                              <td>{row.participant_id}</td>
                              <td>{row.student_name}</td>
                              <td>{row.approval_type}</td>
                              <td>{row.status}</td>
                              <td>{row.reviewer_name || row.reviewer_user_name || '-'}</td>
                              <td>{row.approved_at || row.recorded_at || '-'}</td>
                            </tr>
                          )) : (
                            <tr><td colSpan={6}>No approvals recorded yet.</td></tr>
                                        )}
                        </tbody>
                      </table>
                    </div>
                                  )}</PagedRows>
                                )}

                  {schoolRecordsTab === 'projects' && (
                    <PagedRows items={activeSubmissions}>{(rows) => (
                    <div className="ns-table-wrap">
                      <table className="ns-table">
                        <thead>
                          <tr>
                            <th>Participant ID</th>
                            <th>Student</th>
                            <th>Business</th>
                            <th>Status</th>
                            <th>Score</th>
                            <th>Rank</th>
                            <th>Reviewer</th>
                            <th>Submitted</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeSubmissions.length > 0 ? rows.map((row: any) => (
                            <tr key={row.id} className="ns-row-clickable" onClick={() => openRecordView('submission', Number(row.id))}>
                              <td>{row.participant_id}</td>
                              <td>{row.student_name}</td>
                              <td>{row.source_business_name || '-'}</td>
                              <td>{row.status}</td>
                              <td>{row.score ?? '-'}</td>
                              <td>{row.rank_position ?? '-'}</td>
                              <td>{row.reviewer_name || row.reviewer_user_name || '-'}</td>
                              <td>{row.submission_date || '-'}</td>
                            </tr>
                          )) : (
                            <tr><td colSpan={8}>No submissions have been recorded yet.</td></tr>
                                        )}
                        </tbody>
                      </table>
                    </div>
                                  )}</PagedRows>
                                )}
                </div>
              </article>

              <article className="glass ns-dash-card ns-dash-card--wide reveal in ns-leaderboard-card" hidden={dashboardTab !== 'rankings'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Competition Leaderboard</span>
                  <span className="ns-board__badge">🏆 Live Standings</span>
                </div>
                <p className="ns-leaderboard-tagline">
                  Every interview, approval and submission earns points. {schoolRankingTab === 'students' ? 'Students' : 'Teachers'} climb the board in real time — keep pushing to reach the podium.
                </p>

                <div className="ns-record-tabs" role="tablist" aria-label="Leaderboard view">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={schoolRankingTab === 'students'}
                    className={`ns-record-tabs__btn ${schoolRankingTab === 'students' ? 'is-active' : ''}`}
                    onClick={() => setSchoolRankingTab('students')}
                  >
                    <strong>Students</strong>
                    <span>Champions board</span>
                    <em>{schoolRankedStudents.length}</em>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={schoolRankingTab === 'teachers'}
                    className={`ns-record-tabs__btn ${schoolRankingTab === 'teachers' ? 'is-active' : ''}`}
                    onClick={() => setSchoolRankingTab('teachers')}
                  >
                    <strong>Teachers</strong>
                    <span>Mentor board</span>
                    <em>{schoolRankedTeachers.length}</em>
                  </button>
                </div>

                {schoolLeaderRows.length === 0 ? (
                  <p className="ns-muted" style={{ marginTop: 16 }}>No ranked {schoolRankingTab} yet — standings appear once scores are recorded.</p>
                ) : (
                  <>
                    {schoolPodium.length > 0 && (
                      <div className="ns-podium" aria-label="Top performers">
                        {schoolPodium.map((p) => (
                          <button
                            type="button"
                            key={`podium-${p.type}-${p.id}`}
                            className="ns-podium__place"
                            data-rank={p.rank}
                            onClick={() => setApprovalDetail({ type: p.type, id: p.id })}
                          >
                            <span className="ns-podium__medal" aria-hidden="true">{['🥇', '🥈', '🥉'][p.rank - 1] || `#${p.rank}`}</span>
                            <span className="ns-podium__avatar">{avatarInner(p.name, p.avatar)}</span>
                            <strong className="ns-podium__name">{p.name}</strong>
                            <span className="ns-podium__sub">{p.sub}</span>
                            <span className="ns-podium__score">{p.score}<small>pts</small></span>
                            <span className="ns-podium__pedestal">{p.rank}</span>
                          </button>
                        ))}
                      </div>
                                  )}

                    <div className="ns-leaderboard" role="list">
                      <div className="ns-leaderboard__head" aria-hidden="true">
                        <span>Rank</span>
                        <span />
                        <span>{schoolRankingTab === 'students' ? 'Student' : 'Teacher'}</span>
                        <span>Points</span>
                        <span>{schoolRankingTab === 'students' ? 'Status' : 'Class'}</span>
                      </div>
                      {schoolLeaderRows.map((r) => (
                        <button
                          type="button"
                          role="listitem"
                          key={`leader-${r.type}-${r.id}`}
                          className={`ns-leader-row ${r.rank >= 1 && r.rank <= 3 ? 'is-podium' : ''}`}
                          data-rank={r.rank}
                          onClick={() => setApprovalDetail({ type: r.type, id: r.id })}
                        >
                          <span className="ns-leader-rank">{r.rank >= 1 && r.rank <= 3 ? (['🥇', '🥈', '🥉'][r.rank - 1]) : (r.rank || '—')}</span>
                          <span className="ns-leader-avatar" aria-hidden="true">{avatarInner(r.name, r.avatar)}</span>
                          <div className="ns-leader-id">
                            <strong>{r.name}</strong>
                            <span>{r.sub}</span>
                          </div>
                          <div className="ns-leader-score">
                            <div className="ns-leader-bar"><span style={{ width: `${Math.max(6, Math.round((r.score / schoolLeaderMax) * 100))}%` }} /></div>
                            <strong>{r.score}<small>pts</small></strong>
                          </div>
                          {r.tagType === 'status'
                            ? <span className="ns-status-pill" data-status={String(r.tag).toLowerCase()}>{r.tag}</span>
                            : <span className="ns-leader-tag">{r.tag}</span>}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </article>

              <SchoolRankBoard schools={schoolRankings} mySchoolId={myDashboardSchoolId} hidden={dashboardTab !== 'rankings' && dashboardTab !== 'overview'} />

              {/* Submission review/scoring is admin-only (data isolation): teacher & school
                  cannot see project content or score submissions, so the Reviews tool is removed. */}

              <div className="ns-alert-grid" hidden={dashboardTab !== 'notifications'}>
                <article className="glass ns-dash-card reveal in">
                  <div className="ns-dash-card__head">
                    <span className="eyebrow">School Winners</span>
                    <span className="ns-board__badge">{schoolWinnersQueue.length}</span>
                  </div>
                  <div className="ns-notification-list">
                    {schoolWinnersQueue.length > 0 ? (
                      schoolWinnersQueue.map((winner: any) => (
                        <div className="ns-notification-item" key={winner.id}>
                          <strong>{winner.place} place</strong>
                          <p>{winner.student_name} - {formatMoney(winner.scholarship_amount)}</p>
                          <span>{winner.published_at || winner.announced_at || 'Published'}</span>
                        </div>
                      ))
                    ) : (
                      <p className="ns-muted">No winners published for this school yet.</p>
                                  )}
                  </div>
                </article>
                <article className="glass ns-dash-card reveal in">
                  <div className="ns-dash-card__head">
                    <span className="eyebrow">Notifications</span>
                    <span className="ns-board__badge">{activeUnreadNotifications.length} unread</span>
                  </div>
                  <div className="ns-notification-list">
                    {activeNotifications.length > 0 ? (
                      activeNotifications.slice(0, 5).map((item: any) => (
                        <div className={`ns-notification-item ${item.is_read ? '' : 'is-unread'}`} key={item.id}>
                          <strong>{item.title}</strong>
                          <p>{item.message}</p>
                          <span>{item.created_at}</span>
                          {!item.is_read && (
                            <button className="ns-notification-action" type="button" disabled={busy === `notif-${item.id}`} onClick={() => markNotificationRead(item.id)}>
                              Mark as read
                            </button>
                                        )}
                        </div>
                      ))
                    ) : (
                      <p className="ns-muted">No school notifications yet.</p>
                                  )}
                  </div>
                </article>
              </div>

              {approvalDetail && approvalDetailRecord && createPortal((
                <div
                  className="ns-detail-overlay"
                  role="dialog"
                  aria-modal="true"
                  aria-label={approvalDetail.type === 'student' ? 'Student details' : 'Teacher details'}
                  onClick={() => setApprovalDetail(null)}
                >
                  <div className="ns-detail-card glass" onClick={(event) => event.stopPropagation()}>
                    <button type="button" className="ns-detail-close" aria-label="Close details" onClick={() => setApprovalDetail(null)}>✕</button>

                    {approvalDetail.type === 'student' ? (() => {
                      const s = approvalDetailRecord
                      const detailBusy = busy.startsWith(`student-${s.id}-`)
                      const sStatus = String(s.teacher_approval_status || 'pending').toLowerCase()
                      return (
                        <>
                          <div className="ns-detail-head">
                            <span className="ns-detail-avatar" aria-hidden="true">{avatarInner(s.full_name, s.avatar_url)}</span>
                            <div className="ns-detail-head__id">
                              <span className="eyebrow">Student · {s.participant_id}</span>
                              <h3>{s.full_name}</h3>
                              <span className="ns-status-pill" data-status={String(s.submission_status || '').toLowerCase()}>{s.submission_status || '—'}</span>
                            </div>
                          </div>

                          <div className="ns-detail-section">
                            <span className="ns-detail-section__title">Approval status</span>
                            <div className="ns-detail-grid">
                              <div className="ns-detail-row"><span>Parent consent</span><span className="ns-status-pill" data-status={String(s.parent_consent_status || '').toLowerCase()}>{s.parent_consent_status || '—'}</span></div>
                              <div className="ns-detail-row"><span>Approval</span><span className="ns-status-pill" data-status={String(s.teacher_approval_status || 'pending').toLowerCase()}>{s.teacher_approval_status || 'pending'}</span></div>
                              <div className="ns-detail-row"><span>Submission</span><span className="ns-status-pill" data-status={String(s.submission_status || '').toLowerCase()}>{s.submission_status || '—'}</span></div>
                            </div>
                          </div>

                          <div className="ns-detail-section">
                            <span className="ns-detail-section__title">Profile</span>
                            <div className="ns-detail-grid">
                              <div className="ns-detail-row"><span>Grade</span><strong>{s.grade_level || '—'}</strong></div>
                              <div className="ns-detail-row"><span>Age</span><strong>{s.age ?? '—'}</strong></div>
                              <div className="ns-detail-row"><span>Date of birth</span><strong>{formatDateLabel(s.date_of_birth) || '—'}</strong></div>
                              <div className="ns-detail-row"><span>Username</span><strong>{s.student_username || '—'}</strong></div>
                              <div className="ns-detail-row ns-detail-row--full"><span>Email</span><strong>{s.email || '—'}</strong></div>
                              <div className="ns-detail-row"><span>Phone</span><strong>{s.phone_number || '—'}</strong></div>
                              <div className="ns-detail-row ns-detail-row--full"><span>Home address</span><strong>{s.home_address || '—'}</strong></div>
                              <div className="ns-detail-row"><span>School</span><strong>{s.school_name || '—'}</strong></div>
                              <div className="ns-detail-row"><span>Teacher</span><strong>{s.teacher_full_name || '—'}</strong></div>
                            </div>
                          </div>

                          <div className="ns-detail-section">
                            <span className="ns-detail-section__title">Parent / guardian</span>
                            <div className="ns-detail-grid">
                              <div className="ns-detail-row"><span>Name</span><strong>{s.parent_name || '—'}</strong></div>
                              <div className="ns-detail-row"><span>Phone</span><strong>{s.parent_phone || '—'}</strong></div>
                              <div className="ns-detail-row ns-detail-row--full"><span>Email</span><strong>{s.parent_email || '—'}</strong></div>
                            </div>
                          </div>

                          <div className="ns-detail-section">
                            <span className="ns-detail-section__title">Performance</span>
                            <div className="ns-detail-grid">
                              <div className="ns-detail-row"><span>Interviews</span><strong>{s.interview_count ?? 0}/10</strong></div>
                              <div className="ns-detail-row"><span>Score</span><strong>{s.performance_score ?? 0}</strong></div>
                              <div className="ns-detail-row"><span>School rank</span><strong>#{s.rank_position ?? '—'}</strong></div>
                              <div className="ns-detail-row"><span>Submission score</span><strong>{s.submission_score ?? '—'}</strong></div>
                            </div>
                          </div>

                          {isManagerLayout && (
                          <div className="ns-detail-actions">
                            <button
                              type="button"
                              className="ns-row-btn ns-row-btn--approve"
                              disabled={detailBusy || sStatus === 'approved'}
                              title="Approve student participation"
                              onClick={() => approveStudentInline(s, 'approved')}
                            >
                              {busy === `student-${s.id}-approved` ? 'Saving…' : sStatus === 'approved' ? 'Approved' : 'Approve'}
                            </button>
                            <button
                              type="button"
                              className="ns-row-btn ns-row-btn--reject"
                              disabled={detailBusy || sStatus === 'rejected'}
                              onClick={() => approveStudentInline(s, 'rejected')}
                            >
                              {busy === `student-${s.id}-rejected` ? 'Saving…' : sStatus === 'rejected' ? 'Rejected' : 'Reject'}
                            </button>
                          </div>
                                        )}
                        </>
                      )
                    })() : (() => {
                      const t = approvalDetailRecord
                      const detailBusy = busy.startsWith(`teacher-${t.id}-`)
                      const tStatus = String(t.status || 'registered').toLowerCase()
                      const tStatusLabel = tStatus === 'registered' ? 'pending' : tStatus
                      return (
                        <>
                          <div className="ns-detail-head">
                            <span className="ns-detail-avatar" aria-hidden="true">{avatarInner(t.teacher_full_name, t.avatar_url)}</span>
                            <div className="ns-detail-head__id">
                              <span className="eyebrow">Teacher</span>
                              <h3>{t.teacher_full_name}</h3>
                              <span className="ns-status-pill" data-status={tStatusLabel}>{tStatusLabel}</span>
                            </div>
                          </div>

                          <div className="ns-detail-section">
                            <span className="ns-detail-section__title">Profile</span>
                            <div className="ns-detail-grid">
                              <div className="ns-detail-row"><span>Department</span><strong>{t.role_department || '—'}</strong></div>
                              <div className="ns-detail-row"><span>Grades supported</span><strong>{t.grade_level_supported || '—'}</strong></div>
                              <div className="ns-detail-row ns-detail-row--full"><span>Email</span><strong>{t.school_email || '—'}</strong></div>
                              <div className="ns-detail-row"><span>Phone</span><strong>{t.phone_number || '—'}</strong></div>
                              <div className="ns-detail-row"><span>School</span><strong>{t.linked_school_name || '—'}</strong></div>
                            </div>
                          </div>

                          <div className="ns-detail-section">
                            <span className="ns-detail-section__title">Class performance</span>
                            <div className="ns-detail-grid">
                              <div className="ns-detail-row"><span>Students</span><strong>{t.students_total ?? 0}</strong></div>
                              <div className="ns-detail-row"><span>Students approved</span><strong>{t.teacher_approved ?? 0}</strong></div>
                              <div className="ns-detail-row"><span>Submissions</span><strong>{t.submissions ?? 0}</strong></div>
                              <div className="ns-detail-row"><span>Ranking score</span><strong>{t.ranking_score ?? 0}</strong></div>
                              <div className="ns-detail-row"><span>Avg student score</span><strong>{t.average_student_score ?? 0}</strong></div>
                              <div className="ns-detail-row"><span>Rank</span><strong>#{t.rank_position ?? '—'}</strong></div>
                            </div>
                          </div>

                          <div className="ns-detail-section">
                            <span className="ns-detail-section__title">Top student</span>
                            <div className="ns-detail-grid">
                              <div className="ns-detail-row"><span>Name</span><strong>{t.top_student_name || '—'}</strong></div>
                              <div className="ns-detail-row"><span>Participant</span><strong>{t.top_student_participant_id || '—'}</strong></div>
                              <div className="ns-detail-row"><span>Score</span><strong>{t.top_student_score ?? '—'}</strong></div>
                            </div>
                          </div>

                          <div className="ns-detail-actions">
                            <button
                              type="button"
                              className="ns-row-btn ns-row-btn--approve"
                              disabled={detailBusy || tStatus === 'approved'}
                              onClick={() => approveTeacherInline(t, 'approved')}
                            >
                              {busy === `teacher-${t.id}-approved` ? 'Saving…' : tStatus === 'approved' ? 'Approved' : 'Approve'}
                            </button>
                            <button
                              type="button"
                              className="ns-row-btn ns-row-btn--reject"
                              disabled={detailBusy || tStatus === 'rejected'}
                              onClick={() => approveTeacherInline(t, 'rejected')}
                            >
                              {busy === `teacher-${t.id}-rejected` ? 'Saving…' : tStatus === 'rejected' ? 'Rejected' : 'Reject'}
                            </button>
                          </div>
                        </>
                      )
                    })()}
                  </div>
                </div>
              ), document.body)}

              {recordModal && createPortal((
                <div
                  className="ns-detail-overlay"
                  role="dialog"
                  aria-modal="true"
                  aria-label={`${RECORD_DEFS[recordModal.entity].label} ${recordModal.mode}`}
                  onClick={() => { if (recordModal.mode === 'view') setRecordModal(null) }}
                >
                  <div className="ns-detail-card glass" onClick={(event) => event.stopPropagation()}>
                    <button type="button" className="ns-detail-close" aria-label="Close" onClick={() => setRecordModal(null)}>✕</button>
                    <div className="ns-detail-head">
                      <span className="ns-detail-avatar" aria-hidden="true">
                        {recordModal.mode === 'create' ? '+' : String(recordTitle(recordModal.entity, recordCurrent) || '?').trim().charAt(0).toUpperCase()}
                      </span>
                      <div className="ns-detail-head__id">
                        <span className="eyebrow">
                          {RECORD_DEFS[recordModal.entity].label}{recordModal.mode === 'create' ? ' · New' : recordModal.mode === 'edit' ? ' · Edit' : ''}
                        </span>
                        <h3>{recordModal.mode === 'create' ? `New ${RECORD_DEFS[recordModal.entity].label}` : recordTitle(recordModal.entity, recordCurrent)}</h3>
                      </div>
                    </div>

                    {recordModal.mode === 'view' && recordCurrent && (
                      <>
                        <div className="ns-detail-section">
                          <span className="ns-detail-section__title">Details</span>
                          <div className="ns-detail-grid">
                            {visibleRecordFields(recordModal.entity).map((f) => {
                              let val: any
                              if (f.type === 'checkbox') val = (recordCurrent[f.key] === 1 || recordCurrent[f.key] === true || recordCurrent[f.key] === '1') ? 'Yes' : 'No'
                              else if (f.type === 'teacherRef') val = recordCurrent.teacher_full_name || '—'
                              else if (f.type === 'studentRef') val = recordCurrent.student_name || recordCurrent.full_name || '—'
                              else { const raw = recordCurrent[f.key]; val = (raw === null || raw === undefined || raw === '') ? '—' : String(raw) }
                              const isStatus = f.type === 'select' && /status|approval|consent/i.test(f.key)
                              return (
                                <div className={`ns-detail-row ${f.full || f.type === 'textarea' ? 'ns-detail-row--full' : ''}`} key={f.key}>
                                  <span>{f.label}</span>
                                  {isStatus
                                    ? <span className="ns-status-pill" data-status={String(val).toLowerCase()}>{val}</span>
                                    : <strong>{val}</strong>}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                        {canWriteRecordEntity(recordModal.entity) && (
                          <div className="ns-detail-actions">
                            <button type="button" className="ns-row-btn ns-row-btn--approve" onClick={startRecordEdit}>Edit</button>
                            <button type="button" className="ns-row-btn ns-row-btn--reject" disabled={recordBusy} onClick={deleteRecord}>{recordBusy ? 'Working…' : 'Delete'}</button>
                          </div>
                                      )}
                      </>
                                  )}

                    {(recordModal.mode === 'edit' || recordModal.mode === 'create') && (
                      <form className="ns-record-form" onSubmit={(event) => { event.preventDefault(); saveRecord() }}>
                        <div className="ns-field-grid">
                          {visibleRecordFields(recordModal.entity)
                            .filter((f) => (recordModal.mode === 'create' ? !f.editOnly : !f.createOnly))
                            .map((f) => (
                              <label className={`ns-field ${f.full || f.type === 'textarea' ? 'ns-field--full' : ''} ${f.type === 'checkbox' ? 'ns-field--check' : ''}`} key={f.key}>
                                <span>{f.label}</span>
                                {f.type === 'textarea' ? (
                                  <textarea rows={3} value={recordForm[f.key] ?? ''} onChange={(e) => setRecordField(f.key, e.target.value)} />
                                ) : f.type === 'select' ? (
                                  <select value={recordForm[f.key] ?? ''} onChange={(e) => setRecordField(f.key, e.target.value)} required={f.required}>
                                    {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                                  </select>
                                ) : f.type === 'checkbox' ? (
                                  <input type="checkbox" checked={!!recordForm[f.key]} onChange={(e) => setRecordField(f.key, e.target.checked)} />
                                ) : f.type === 'studentRef' ? (
                                  <select value={recordForm[f.key] ?? ''} onChange={(e) => setRecordField(f.key, e.target.value)} required={f.required}>
                                    <option value="">Select student</option>
                                    {asArray<any>(schoolDashboard?.students).map((s: any) => <option key={s.id} value={s.id}>{s.full_name} — {s.participant_id}</option>)}
                                  </select>
                                ) : f.type === 'teacherRef' ? (
                                  <select value={recordForm[f.key] ?? ''} onChange={(e) => setRecordField(f.key, e.target.value)}>
                                    <option value="">No teacher</option>
                                    {asArray<any>(schoolDashboard?.teachers).map((t: any) => <option key={t.id} value={t.id}>{t.teacher_full_name}</option>)}
                                  </select>
                                ) : (
                                  <input
                                    type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : 'text'}
                                    value={recordForm[f.key] ?? ''}
                                    onChange={(e) => setRecordField(f.key, e.target.value)}
                                    required={f.required}
                                  />
                                )}
                              </label>
                            ))}
                        </div>
                        <div className="ns-detail-actions">
                          <button type="submit" className="ns-row-btn ns-row-btn--approve" disabled={recordBusy}>
                            {recordBusy ? 'Saving…' : (recordModal.mode === 'create' ? `Create ${RECORD_DEFS[recordModal.entity].label}` : 'Save changes')}
                          </button>
                          <button type="button" className="ns-row-btn ns-row-btn--reject" onClick={() => (recordModal.id != null ? setRecordModal({ ...recordModal, mode: 'view' }) : setRecordModal(null))}>Cancel</button>
                        </div>
                      </form>
                                  )}
                  </div>
                </div>
              ), document.body)}
            </div>
              )}


              {adminDashboard && (
            <div className="ns-dash-grid">
              <article className="glass ns-dash-card ns-dash-card--wide reveal in">
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Admin Dashboard</span>
                  <span className="ns-board__badge">Admin tools</span>
                </div>
                <div className="ns-dashboard-callout">
                  <div className="ns-dashboard-callout__head">
                    <strong>Program Overview</strong>
                    <span>{adminDashboard.summary.winners || 0} winners published</span>
                  </div>
                  <p>Track the whole program, review results, and download data right here.</p>
                </div>
                <span className="ns-overview-label">Program totals · tap a card to open it</span>
                <div className="ns-quick-stats">
                  {([
                    ['Parents', adminDashboard.summary.parents, 'data'],
                    ['Businesses', adminDashboard.summary.businesses, 'data'],
                    ['Submissions', adminDashboard.summary.submissions, 'reviews'],
                  ] as [string, number, DashboardTabKey][]).map(([label, val, tab]) => (
                    <button type="button" className="is-clickable" key={label} onClick={() => onStatClick({ tab })}><span>{label}</span><strong>{String(val ?? 0)}</strong></button>
                  ))}
                </div>
                <div className="ns-actions">
                  <button className="btn btn--sm" type="button" onClick={() => openDashboardTab('profile')}>
                    View Profile
                  </button>
                  {['students', 'parents', 'schools', 'teachers', 'businesses', 'submissions', 'winners', 'approvals', 'notifications'].map((type) => (
                    <button key={type} className="btn btn--sm" type="button" onClick={() => exportCsv(type)} disabled={busy === `export-${type}`}>
                      {busy === `export-${type}` ? `Exporting ${type}...` : `Export ${type}`}
                    </button>
                  ))}
                </div>
              </article>

              <article className="glass ns-dash-card reveal in">
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Student Progress</span>
                  <span className="ns-board__badge">How students are doing</span>
                </div>
                <div className="ns-quick-stats">
                  <button type="button" className="is-clickable" onClick={() => onStatClick({ tab: 'data' })}><span>Parents Waiting</span><strong>{adminStudentSummary.parent_pending || 0}</strong></button>
                  <button type="button" className="is-clickable" onClick={() => onStatClick({ tab: 'data' })}><span>Parents Approved</span><strong>{adminStudentSummary.parent_approved || 0}</strong></button>
                  <button type="button" className="is-clickable" onClick={() => onStatClick({ tab: 'data' })}><span>Students Waiting</span><strong>{adminStudentSummary.school_pending || 0}</strong></button>
                  <button type="button" className="is-clickable" onClick={() => onStatClick({ tab: 'data' })}><span>Students Approved</span><strong>{adminStudentSummary.school_approved || 0}</strong></button>
                  <button type="button" className="is-clickable" onClick={() => onStatClick({ tab: 'data' })}><span>Teachers Waiting</span><strong>{adminStudentSummary.teacher_pending || 0}</strong></button>
                  <button type="button" className="is-clickable" onClick={() => onStatClick({ tab: 'data' })}><span>Teachers Approved</span><strong>{adminStudentSummary.teacher_approved || 0}</strong></button>
                  <button type="button" className="is-clickable" onClick={() => onStatClick({ tab: 'data' })}><span>Ready to Submit</span><strong>{adminStudentSummary.eligible_to_submit || 0}</strong></button>
                  <button type="button" className="is-clickable" onClick={() => onStatClick({ tab: 'reviews' })}><span>Submitted</span><strong>{adminStudentSummary.submitted || 0}</strong></button>
                  <button type="button" className="is-clickable" onClick={() => onStatClick({ tab: 'data' })}><span>Interviews</span><strong>{adminStudentSummary.interviews_total || 0}</strong></button>
                </div>
              </article>

              {dashboardTab === 'profile' && (<><ProfilePhotoCard /><ChangePasswordCard /></>)}
              <article className="glass ns-dash-card reveal in" hidden={dashboardTab !== 'profile'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Profile</span>
                  <span className="ns-board__badge">{user?.role || 'admin'}</span>
                </div>
                <div className="ns-approval-stack">
                  <div className="ns-approval-row"><strong>User</strong><span>{user?.full_name || '-'}</span></div>
                  <div className="ns-approval-row"><strong>Email</strong><span>{user?.email || '-'}</span></div>
                  <div className="ns-approval-row"><strong>Access</strong><span>Schools, teachers, students, approvals, results</span></div>
                  <div className="ns-approval-row"><strong>Mode</strong><span>Platform admin and review control</span></div>
                </div>
                <div className="ns-actions">
                  <button className="btn btn--sm btn--solid" type="button" onClick={() => openDashboardTab('data')}>Open Data</button>
                  <button className="btn btn--sm" type="button" onClick={() => openDashboardTab('rankings')}>View Rankings</button>
                </div>
              </article>

              <article className="glass ns-dash-card ns-dash-card--wide reveal in ns-leaderboard-card" hidden={dashboardTab !== 'rankings'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Competition Leaderboard</span>
                  <span className="ns-board__badge">🏆 {adminRankSchool ? adminRankSchool.school_name : 'All schools'}</span>
                </div>
                <p className="ns-leaderboard-tagline">
                  Every interview, approval and submission earns points. Filter by a single school or view every school together — {adminRankingTab === 'students' ? 'students' : 'teachers'} climb the board in real time.
                </p>

                <div className="ns-school-toolbar">
                  <label className="ns-school-select">
                    <span>School</span>
                    <select value={adminRankSchoolId} onChange={(e) => setAdminRankSchoolId(e.target.value)}>
                      <option value="">All schools (global)</option>
                      {adminSchools.map((s: any) => <option key={s.id} value={s.id}>{s.school_name}</option>)}
                    </select>
                  </label>
                  {adminRankSchool && <button type="button" className="btn btn--sm" onClick={() => setAdminRankSchoolId('')}>← All schools</button>}
                </div>

                <div className="ns-record-tabs" role="tablist" aria-label="Leaderboard view">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={adminRankingTab === 'students'}
                    className={`ns-record-tabs__btn ${adminRankingTab === 'students' ? 'is-active' : ''}`}
                    onClick={() => setAdminRankingTab('students')}
                  >
                    <strong>Students</strong>
                    <span>Champions board</span>
                    <em>{adminRankStudentsScoped.length}</em>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={adminRankingTab === 'teachers'}
                    className={`ns-record-tabs__btn ${adminRankingTab === 'teachers' ? 'is-active' : ''}`}
                    onClick={() => setAdminRankingTab('teachers')}
                  >
                    <strong>Teachers</strong>
                    <span>Mentor board</span>
                    <em>{adminRankTeachersScoped.length}</em>
                  </button>
                </div>

                {adminLeaderRows.length === 0 ? (
                  <p className="ns-muted" style={{ marginTop: 16 }}>No ranked {adminRankingTab} yet — standings appear once scores are recorded.</p>
                ) : (
                  <>
                    {adminPodium.length > 0 && (
                      <div className="ns-podium" aria-label="Top performers">
                        {adminPodium.map((p) => (
                          <div
                            key={`admin-podium-${p.type}-${p.id}`}
                            className="ns-podium__place ns-podium__place--static"
                            data-rank={p.rank}
                          >
                            <span className="ns-podium__medal" aria-hidden="true">{['🥇', '🥈', '🥉'][p.rank - 1] || `#${p.rank}`}</span>
                            <span className="ns-podium__avatar">{avatarInner(p.name, p.avatar)}</span>
                            <strong className="ns-podium__name">{p.name}</strong>
                            <span className="ns-podium__sub">{p.sub}</span>
                            <span className="ns-podium__score">{p.score}<small>pts</small></span>
                            <span className="ns-podium__pedestal">{p.rank}</span>
                          </div>
                        ))}
                      </div>
                                  )}

                    <div className="ns-leaderboard" role="list">
                      <div className="ns-leaderboard__head" aria-hidden="true">
                        <span>Rank</span>
                        <span />
                        <span>{adminRankingTab === 'students' ? 'Student' : 'Teacher'}</span>
                        <span>Points</span>
                        <span>{adminRankingTab === 'students' ? 'Status' : 'Class'}</span>
                      </div>
                      {adminLeaderRows.map((r) => (
                        <div
                          role="listitem"
                          key={`admin-leader-${r.type}-${r.id}`}
                          className={`ns-leader-row ns-leader-row--static ${r.rank >= 1 && r.rank <= 3 ? 'is-podium' : ''}`}
                          data-rank={r.rank}
                        >
                          <span className="ns-leader-rank">{r.rank >= 1 && r.rank <= 3 ? (['🥇', '🥈', '🥉'][r.rank - 1]) : (r.rank || '—')}</span>
                          <span className="ns-leader-avatar" aria-hidden="true">{avatarInner(r.name, r.avatar)}</span>
                          <div className="ns-leader-id">
                            <strong>{r.name}</strong>
                            <span>{r.sub}</span>
                          </div>
                          <div className="ns-leader-score">
                            <div className="ns-leader-bar"><span style={{ width: `${Math.max(6, Math.round((r.score / adminLeaderMax) * 100))}%` }} /></div>
                            <strong>{r.score}<small>pts</small></strong>
                          </div>
                          {r.tagType === 'status'
                            ? <span className="ns-status-pill" data-status={String(r.tag).toLowerCase()}>{r.tag}</span>
                            : <span className="ns-leader-tag">{r.tag}</span>}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </article>

              <SchoolRankBoard schools={schoolRankings} mySchoolId={null} hidden={dashboardTab !== 'rankings'} />

              <article className="glass ns-dash-card ns-dash-card--wide reveal in" hidden={dashboardTab !== 'data'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Submissions</span>
                  <span className="ns-board__badge">{adminDashboard.submissions?.length || 0}</span>
                </div>
                <PagedRows items={adminDashboard.submissions || []}>{(rows) => (
                <div className="ns-table-wrap">
                  <table className="ns-table">
                    <thead>
                      <tr>
                        <th>Participant ID</th>
                        <th>Student</th>
                        <th>Problem</th>
                        <th>Status</th>
                        <th>Score</th>
                        <th>Rank</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row: any) => (
                        <tr key={row.id}>
                          <td>{row.participant_id}</td>
                          <td>{row.student_name}</td>
                          <td>{clipText(row.problem_identified, 42)}</td>
                          <td>{row.status}</td>
                          <td>{row.score ?? '-'}</td>
                          <td>{row.rank_position ?? '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                )}</PagedRows>
              </article>

              <article className="glass ns-dash-card ns-dash-card--wide reveal in" hidden={dashboardTab !== 'data'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Schools</span>
                  <span className="ns-board__badge">{adminSchools.length}</span>
                </div>
                <PagedRows items={adminSchools}>{(rows) => (
                <div className="ns-table-wrap">
                  <table className="ns-table">
                    <thead>
                      <tr>
                        <th>School</th>
                        <th>District</th>
                        <th>Administrator</th>
                        <th>Email</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row: any) => (
                        <tr key={row.id}>
                          <td>{row.school_name}</td>
                          <td>{row.school_district || '-'}</td>
                          <td>{row.administrator_name || '-'}</td>
                          <td>{row.administrator_email || '-'}</td>
                          <td>{row.status || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                )}</PagedRows>
              </article>

              <article className="glass ns-dash-card ns-dash-card--wide reveal in" hidden={dashboardTab !== 'data'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Parent Consent</span>
                  <span className="ns-board__badge">{adminParents.length}</span>
                </div>
                <PagedRows items={adminParents}>{(rows) => (
                <div className="ns-table-wrap">
                  <table className="ns-table">
                    <thead>
                      <tr>
                        <th>Participant ID</th>
                        <th>Student</th>
                        <th>Parent</th>
                        <th>Relationship</th>
                        <th>Status</th>
                        <th>Approved At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row: any) => (
                        <tr key={row.id}>
                          <td>{row.participant_id}</td>
                          <td>{row.student_name}</td>
                          <td>{row.parent_full_name}</td>
                          <td>{row.relationship_to_student}</td>
                          <td>{row.student_parent_status || (row.consent_checked ? 'approved' : 'pending')}</td>
                          <td>{row.approved_at || row.consented_at || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                )}</PagedRows>
              </article>

              <article className="glass ns-dash-card ns-dash-card--wide reveal in" hidden={dashboardTab !== 'data'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Approval Records</span>
                  <span className="ns-board__badge">{adminApprovals.length}</span>
                </div>
                <PagedRows items={adminApprovals}>{(rows) => (
                <div className="ns-table-wrap">
                  <table className="ns-table">
                    <thead>
                      <tr>
                        <th>Participant ID</th>
                        <th>Student</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Reviewer</th>
                        <th>Recorded At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row: any) => (
                        <tr key={row.id}>
                          <td>{row.participant_id}</td>
                          <td>{row.student_name}</td>
                          <td>{row.approval_type}</td>
                          <td>{row.status}</td>
                          <td>{row.reviewer_name || row.reviewer_user_name || '-'}</td>
                          <td>{row.recorded_at || row.approved_at || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                )}</PagedRows>
              </article>

              <article className="glass ns-dash-card ns-dash-card--wide reveal in" hidden={dashboardTab !== 'data'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Business Interviews</span>
                  <span className="ns-board__badge">{adminBusinesses.length}</span>
                </div>
                <PagedRows items={adminBusinesses}>{(rows) => (
                <div className="ns-table-wrap">
                  <table className="ns-table">
                    <thead>
                      <tr>
                        <th>Participant ID</th>
                        <th>Student</th>
                        <th>Visit</th>
                        <th>Business</th>
                        <th>Category</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row: any) => (
                        <tr key={row.id}>
                          <td>{row.participant_id}</td>
                          <td>{row.student_name}</td>
                          <td>{row.visit_number}</td>
                          <td>{row.business_name}</td>
                          <td>{row.business_category}</td>
                          <td>{row.date_of_visit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                )}</PagedRows>
              </article>

              <article className="glass ns-dash-card reveal in" hidden={dashboardTab !== 'notifications'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Notifications</span>
                  <span className="ns-board__badge">{adminUnreadNotifications.length} unread</span>
                </div>
                <div className="ns-notification-list">
                  {adminNotifications.length > 0 ? adminNotifications.slice(0, 8).map((item: any) => (
                    <div className={`ns-notification-item ${item.is_read ? '' : 'is-unread'}`} key={item.id}>
                      <strong>{item.title}</strong>
                      <p>{item.message}</p>
                      <span>{item.created_at}</span>
                      {!item.is_read && (
                        <button className="ns-notification-action" type="button" disabled={busy === `notif-${item.id}`} onClick={() => markNotificationRead(item.id)}>
                          Mark as read
                        </button>
                                    )}
                    </div>
                  )) : <p className="ns-muted">No admin notifications yet.</p>}
                </div>
              </article>

              <form className="glass ns-form ns-form--compact reveal in" onSubmit={submitAdminReview} hidden={dashboardTab !== 'reviews'}>
                <div className="ns-form__head">
                  <span className="eyebrow">Submission Review</span>
                  <h3>Score and publish a result</h3>
                  <p>Use this form to approve, reject, or mark a submission as a winner.</p>
                </div>
                <div className="ns-field-grid">
                  <label className="ns-field ns-field--full">
                    <span>Submission</span>
                    <select name="submission_id" defaultValue="" required>
                      <option value="">Select submission</option>
                      {(adminDashboard.submissions || []).map((row: any) => (
                        <option key={row.id} value={row.id}>
                          #{row.id} - {row.student_name} - {row.status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="ns-field">
                    <span>Status</span>
                    <select name="status" defaultValue="submitted">
                      <option value="submitted">Submitted</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                      <option value="winner">Winner</option>
                    </select>
                  </label>
                  <label className="ns-field">
                    <span>Score</span>
                    <input name="score" type="number" min="0" step="0.01" placeholder="Optional" />
                  </label>
                  <label className="ns-field">
                    <span>Rank Position</span>
                    <input name="rank_position" type="number" min="1" max="3" placeholder="1, 2, or 3" />
                  </label>
                  <label className="ns-field">
                    <span>Place</span>
                    <input name="place" placeholder="First / Second / Third" />
                  </label>
                  <label className="ns-field">
                    <span>Scholarship Amount</span>
                    <input name="scholarship_amount" type="number" min="1" step="1" placeholder="2500" />
                  </label>
                  <label className="ns-field">
                    <span>Student Bonus Points (max 15)</span>
                    <input name="student_award_points" type="number" min="0" max="15" placeholder="0–15" />
                  </label>
                  <label className="ns-field">
                    <span>Teacher Bonus Points (max 8)</span>
                    <input name="teacher_award_points" type="number" min="0" max="8" defaultValue="3" />
                  </label>
                  <label className="ns-field ns-field--full">
                    <span>Reviewer Notes</span>
                    <textarea name="reviewer_notes" rows={3} placeholder="Optional review notes" />
                  </label>
                </div>
                <button className="btn btn--solid" type="submit" disabled={busy === 'admin-review'}>
                  {busy === 'admin-review' ? 'Saving...' : 'Update Submission'}
                </button>
              </form>

              <form className="glass ns-form ns-form--compact reveal in" onSubmit={submitInterviewPoints} hidden={dashboardTab !== 'reviews'}>
                <div className="ns-form__head">
                  <span className="eyebrow">Interview Points</span>
                  <h3>Award bonus points for an interview</h3>
                  <p>Approve a student's business interview and grant bonus points (student up to 15, teacher up to 8, default 3).</p>
                </div>
                <div className="ns-field-grid">
                  <label className="ns-field ns-field--full">
                    <span>Interview</span>
                    <select name="interview_id" defaultValue="" required>
                      <option value="">Select interview</option>
                      {adminBusinesses.map((row: any) => (
                        <option key={row.id} value={row.id}>
                          #{row.id} - {row.student_name} - Visit {row.visit_number} - {row.business_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="ns-field">
                    <span>Student Bonus Points (max 15)</span>
                    <input name="student_award_points" type="number" min="0" max="15" placeholder="0–15" />
                  </label>
                  <label className="ns-field">
                    <span>Teacher Bonus Points (max 8)</span>
                    <input name="teacher_award_points" type="number" min="0" max="8" defaultValue="3" />
                  </label>
                </div>
                <button className="btn btn--solid" type="submit" disabled={busy === 'interview-points'}>
                  {busy === 'interview-points' ? 'Saving...' : 'Award Interview Points'}
                </button>
              </form>

              <form className="glass ns-form ns-form--compact reveal in" onSubmit={publishWinners} hidden={dashboardTab !== 'reviews'}>
                <div className="ns-form__head">
                  <span className="eyebrow">Publish Winners</span>
                  <h3>Select the top 3 submissions</h3>
                  <p>Enter submission IDs, placement, and scholarship amounts. The backend will publish them to the site.</p>
                </div>
                {[1, 2, 3].map((slot) => (
                  <div className="ns-winner-form-row" key={slot}>
                    <label className="ns-field"><span>Submission ID {slot}</span><input name={`winner_${slot}_submission_id`} type="number" min="1" /></label>
                    <label className="ns-field"><span>Place</span><input name={`winner_${slot}_place`} placeholder={slot === 1 ? 'first' : slot === 2 ? 'second' : 'third'} /></label>
                    <label className="ns-field"><span>Amount</span><input name={`winner_${slot}_amount`} type="number" min="1" step="1" placeholder={slot === 1 ? '2500' : slot === 2 ? '1500' : '1000'} /></label>
                  </div>
                ))}
                <button className="btn btn--solid" type="submit" disabled={busy === 'publish'}>{busy === 'publish' ? 'Publishing...' : 'Publish Winners'}</button>
              </form>
            </div>
              )}
            </div>
          </div>
        </div>
      </section>
        </>
      )}

    </div>
  )
}
