// Shared registration / form helpers used by both the challenge page (NewSchool.tsx)
// and the reusable <ChallengeRegistration> component (page + header popup). Pure
// functions + small presentational components — no page-specific state.
import { api } from './api'

// ---- FormData readers ----
export const value = (fd: FormData, key: string) => String(fd.get(key) ?? '').trim()
export const checked = (fd: FormData, key: string) => fd.get(key) !== null
export const fileValue = (fd: FormData, key: string) => {
  const item = fd.get(key)
  return item instanceof File && item.size > 0 ? item : null
}

/** Whole-years age from a YYYY-MM-DD date of birth, or '' if blank/invalid. */
export const ageFromDob = (dob: string): string => {
  if (!dob) return ''
  const d = new Date(`${dob}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  const today = new Date()
  let age = today.getFullYear() - d.getFullYear()
  const m = today.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age -= 1
  return age >= 0 && age < 150 ? String(age) : ''
}

/** Today's date as YYYY-MM-DD in the local timezone (for <input type="date"> min/max). */
export const todayInputDate = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function uploadIfPresent(file: File | null): Promise<string> {
  if (!file) return ''
  const res = await api.upload<{ url: string }>('new-school/upload', file)
  return res.url
}

export const MAX_VIDEO_BYTES = 70 * 1024 * 1024
export const MAX_DOC_BYTES = 5 * 1024 * 1024

// ---- Word-count helpers (My Work long-answer fields) ----
export const countWords = (text: string) => (text.trim().match(/\S+/g) || []).length
/** Throw a friendly error if a long-answer field isn't between min..max words. */
export function assertWordRange(text: string, label: string, min = 50, max = 500) {
  const n = countWords(text)
  if (n < min) throw new Error(`${label} needs at least ${min} words — you wrote ${n}.`)
  if (n > max) throw new Error(`${label} must be ${max} words or fewer — you wrote ${n}.`)
}
/** Throw if a short field is under a character minimum (a single letter is never valid). */
export function assertMinChars(text: string, label: string, min = 3) {
  if (text.trim().length < min) throw new Error(`${label} must be at least ${min} characters.`)
}

// ---- Inline (below-field) validation ----
// Each helper RETURNS an error string ('' = valid) so a submit handler can build a
// { fieldName: message } map and render the message under the matching field.
export type FieldErrors = Record<string, string>
export const REQUIRED_MSG = 'This field is required.'
export const vRequired = (v: string, msg = REQUIRED_MSG) => (v.trim() ? '' : msg)
export const vMinChars = (v: string, min: number, label = 'This field') =>
  !v.trim() ? REQUIRED_MSG : v.trim().length >= min ? '' : `${label} must be at least ${min} characters.`
export const vEmail = (v: string) =>
  !v.trim() ? REQUIRED_MSG : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? '' : 'Enter a valid email address.'
export const vPhone = (v: string, required = true) => {
  const digits = v.replace(/\D/g, '')
  if (!digits) return required ? REQUIRED_MSG : ''
  return digits.length >= 7 && digits.length <= 15 ? '' : 'Enter a valid phone number (7–15 digits).'
}
export const vZip = (v: string) =>
  !v.trim() ? REQUIRED_MSG : /^[A-Za-z0-9][A-Za-z0-9 -]{2,9}$/.test(v.trim()) ? '' : 'Enter a valid ZIP / postal code.'
export const vUrl = (v: string, required = false) =>
  !v.trim() ? (required ? REQUIRED_MSG : '') : /^https?:\/\/[^\s.]+\.[^\s]+$/.test(v.trim()) ? '' : 'Enter a full URL (https://…).'
export const vPassword = (v: string) => (!v ? REQUIRED_MSG : v.length >= 6 ? '' : 'Password must be at least 6 characters.')
export const vUsername = (v: string) =>
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
export const sanitizeField = (name: string, value: string): string => {
  if (name === 'student_username') return value.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 30)
  if (/phone/i.test(name) || name === 'main_phone') return value.replace(/[^\d+\-() ]/g, '').slice(0, 20)
  if (name === 'addr_zip') return value.replace(/[^A-Za-z0-9 -]/g, '').slice(0, 10)
  if (/email/i.test(name)) return value.replace(/\s/g, '').slice(0, 254)
  if (name === 'password' || name === 'confirm_password') return value.slice(0, 64)
  if (name === 'addr_floor') return value.slice(0, 20)
  if (name === 'grade_level' || name === 'addr_state' || name === 'addr_country') return value.slice(0, 40)
  if (/website|url/i.test(name)) return value.replace(/\s/g, '').slice(0, 200)
  if (name === 'digital_signature') return value.slice(0, 80)
  return value.slice(0, 100)
}

/** Drop the '' (valid) entries so the caller can test `Object.keys(...).length`. */
export const pruneErrors = (errs: FieldErrors): FieldErrors =>
  Object.fromEntries(Object.entries(errs).filter(([, msg]) => msg))

/** Scroll to and focus the first field that has an error. */
export const focusFirstError = (form: HTMLFormElement, errs: FieldErrors) => {
  const first = Object.keys(errs)[0]
  if (!first) return
  const el = form.querySelector<HTMLElement>(`[name="${first}"]`)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    window.setTimeout(() => el.focus?.(), 250)
  }
}

/** Map a server-side registration error to the field it belongs to (duplicate username / email). */
export const mapRegisterError = (err: unknown, emailField = 'email'): FieldErrors | null => {
  const m = (err instanceof Error ? err.message : '').toLowerCase()
  if (m.includes('username')) return { student_username: 'That username is already taken — please choose another.' }
  if (m.includes('email') && (m.includes('use') || m.includes('exist') || m.includes('registered') || m.includes('account') || m.includes('taken')))
    return { [emailField]: 'An account with this email already exists.' }
  return null
}

/** Combine the split address inputs (addr_*) into one stored address line. */
export const joinAddress = (fd: FormData, prefix = 'addr_') => {
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
export const validateAddress = (fd: FormData, prefix = 'addr_'): FieldErrors => ({
  [`${prefix}street`]: vRequired(value(fd, `${prefix}street`)),
  [`${prefix}city`]: vRequired(value(fd, `${prefix}city`)),
  [`${prefix}state`]: vRequired(value(fd, `${prefix}state`)),
  [`${prefix}zip`]: vZip(value(fd, `${prefix}zip`)),
  [`${prefix}country`]: vRequired(value(fd, `${prefix}country`)),
})

/** Inline error message rendered directly under a form field. */
export function FieldError({ msg, full = false }: { msg?: string; full?: boolean }) {
  if (!msg) return null
  return <span className={`ns-field-error${full ? ' ns-field--full' : ''}`} role="alert">{msg}</span>
}

/** Reusable split-address inputs (Street / Floor / City / State / ZIP / Country). */
export function AddressFields({ errs, title = 'Home Address' }: { errs: FieldErrors; title?: string }) {
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
