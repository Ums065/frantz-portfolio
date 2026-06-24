import { useEffect, useState } from 'react'
import { useAuth, type RegistrationRole } from '../context/AuthContext'
import { api } from '../lib/api'
import { BRAND_LOGO } from '../lib/brandAssets'
import TermsAgreement from './TermsAgreement'
import { recordTermsAcceptance } from '../lib/recordTermsAcceptance'

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

const Mono = () => (
  <div className="mmono"><img src={BRAND_LOGO} alt="FC logo" decoding="async" /></div>
)

const OkIcon = () => (
  <div className="ok-icon">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <path d="M8 12.5l2.5 2.5L16 9" />
    </svg>
  </div>
)

const registerRoleOptions: Array<{
  value: RegistrationRole
  label: string
  description: string
}> = [
  { value: 'community', label: 'Community', description: 'Basic site access' },
  { value: 'student', label: 'Student', description: 'Challenge participant' },
  { value: 'parent', label: 'Parent', description: 'QR consent flow' },
  { value: 'school', label: 'School', description: 'School admin access' },
  { value: 'teacher', label: 'Teacher', description: 'Teacher dashboard access' },
]

const registerRoleMeta: Record<RegistrationRole, { title: string; subtitle: string; helper: string; button: string }> = {
  community: {
    title: 'Join the Community',
    subtitle: 'Create a standard site account to stay connected.',
    helper: 'Community accounts are reviewed by admin before member access is activated.',
    button: 'Create Account',
  },
  student: {
    title: 'Student Registration',
    subtitle: 'Register for the Community Business Impact Challenge.',
    helper: 'Students must be 11-19 and the account is reviewed by admin before the challenge dashboard opens.',
    button: 'Register Student',
  },
  parent: {
    title: 'Parent Consent',
    subtitle: 'Use the QR token from the student profile to finish consent.',
    helper: 'Parent records are linked to the student QR flow and are reviewed before access is fully activated.',
    button: 'Save Consent',
  },
  school: {
    title: 'School Registration',
    subtitle: 'Register your school for challenge oversight and approvals.',
    helper: 'School accounts are queued for admin review before the dashboard becomes active.',
    button: 'Register School',
  },
  teacher: {
    title: 'Teacher Registration',
    subtitle: 'Create a teacher account under your school.',
    helper: 'Teacher accounts are queued for admin review before tracking tools unlock.',
    button: 'Register Teacher',
  },
}

type RegisterFormState = {
  role: RegistrationRole
  fullName: string
  email: string
  password: string
  confirmPassword: string
  studentUsername: string
  age: string
  dateOfBirth: string
  phoneNumber: string
  homeAddress: string
  schoolName: string
  schoolId: string
  teacherId: string
  gradeLevel: string
  parentName: string
  parentPhone: string
  parentEmail: string
  qrToken: string
  relationshipToStudent: string
  governmentIdUrl: string
  digitalSignature: string
  schoolAddress: string
  schoolDistrict: string
  mainPhone: string
  principalName: string
  administratorPhone: string
  roleDepartment: string
  gradeLevelSupported: string
  consentChecked: boolean
}

const createRegisterForm = (): RegisterFormState => ({
  role: 'community',
  fullName: '',
  email: '',
  password: '',
  confirmPassword: '',
  studentUsername: '',
  age: '',
  dateOfBirth: '',
  phoneNumber: '',
  homeAddress: '',
  schoolName: '',
  schoolId: '',
  teacherId: '',
  gradeLevel: '',
  parentName: '',
  parentPhone: '',
  parentEmail: '',
  qrToken: '',
  relationshipToStudent: '',
  governmentIdUrl: '',
  digitalSignature: '',
  schoolAddress: '',
  schoolDistrict: '',
  mainPhone: '',
  principalName: '',
  administratorPhone: '',
  roleDepartment: '',
  gradeLevelSupported: '',
  consentChecked: false,
})

type RegisterTextFieldKey = Exclude<keyof RegisterFormState, 'role' | 'consentChecked'>

const phoneFieldKeys: RegisterTextFieldKey[] = ['phoneNumber', 'parentPhone', 'mainPhone', 'administratorPhone']
const phoneFieldKeySet = new Set<RegisterTextFieldKey>(phoneFieldKeys)
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const usernamePattern = /^[A-Za-z0-9._-]{3,30}$/

const normalizeSpaces = (value: string) => value.replace(/\s+/g, ' ').trim()
const digitsOnly = (value: string) => value.replace(/\D+/g, '').slice(0, 15)

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

const requireText = (value: string, label: string, minLength = 1) => {
  const cleaned = normalizeSpaces(value)
  if (cleaned.length < minLength) {
    throw new Error(minLength > 1 ? `${label} must be at least ${minLength} characters.` : `${label} is required.`)
  }
  return cleaned
}

const requireEmail = (value: string, label: string) => {
  const cleaned = value.trim().toLowerCase()
  if (!emailPattern.test(cleaned)) {
    throw new Error(`${label} must be a valid email address.`)
  }
  return cleaned
}

const requirePhone = (value: string, label: string) => {
  const cleaned = digitsOnly(value)
  if (!/^\d{7,15}$/.test(cleaned)) {
    throw new Error(`${label} must be 7 to 15 digits.`)
  }
  return cleaned
}

const requirePassword = (value: string) => {
  if (value.length < 6) {
    throw new Error('Password must be at least 6 characters.')
  }
  return value
}

const validateRegisterForm = (form: RegisterFormState, termsAccepted: boolean) => {
  if (!termsAccepted) {
    throw new Error('You must accept the terms to continue.')
  }

  requirePassword(form.password)
  if (form.password !== form.confirmPassword) {
    throw new Error('Passwords do not match.')
  }

  switch (form.role) {
    case 'community':
      requireText(form.fullName, 'Full name', 3)
      requireEmail(form.email, 'Email address')
      return
    case 'student': {
      requireText(form.fullName, 'Student full name', 3)
      if (!usernamePattern.test(form.studentUsername.trim())) {
        throw new Error('Student username must be 3 to 30 characters and use only letters, numbers, dots, dashes, or underscores.')
      }
      const age = Number(form.age)
      if (!Number.isInteger(age) || age < 11 || age > 19) {
        throw new Error('Age must be between 11 and 19.')
      }
      if (!form.dateOfBirth) {
        throw new Error('Date of birth is required.')
      }
      const dob = new Date(`${form.dateOfBirth}T00:00:00`)
      if (Number.isNaN(dob.getTime())) {
        throw new Error('Date of birth is invalid.')
      }
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      if (dob > today) {
        throw new Error('Date of birth cannot be in the future.')
      }
      requireEmail(form.email, 'Student email')
      requirePhone(form.phoneNumber, 'Phone number')
      requireText(form.schoolName, 'School name', 2)
      if (!form.teacherId) {
        throw new Error('Please select a teacher.')
      }
      requireText(form.gradeLevel, 'Grade level', 1)
      requireText(form.homeAddress, 'Home address', 8)
      requireText(form.parentName, 'Parent / Guardian name', 3)
      requirePhone(form.parentPhone, 'Parent phone number')
      requireEmail(form.parentEmail, 'Parent email address')
      return
    }
    case 'parent':
      requireText(form.qrToken, 'Student QR token', 6)
      requireText(form.fullName, 'Parent full name', 3)
      requireText(form.relationshipToStudent, 'Relationship to student', 2)
      requirePhone(form.phoneNumber, 'Phone number')
      requireEmail(form.email, 'Email address')
      requireText(form.homeAddress, 'Home address', 8)
      if (form.governmentIdUrl.trim() !== '') {
        try {
          new URL(form.governmentIdUrl.trim())
        } catch {
          throw new Error('Government ID URL must be a valid link.')
        }
      }
      requireText(form.digitalSignature || form.fullName, 'Digital signature', 3)
      return
    case 'school':
      requireText(form.schoolName, 'School name', 2)
      requireText(form.schoolAddress, 'School address', 8)
      requireText(form.schoolDistrict, 'School district', 2)
      requirePhone(form.mainPhone, 'Main phone number')
      requireText(form.principalName, 'Principal name', 3)
      requireText(form.fullName, 'Administrator name', 3)
      requireEmail(form.email, 'Administrator email')
      requirePhone(form.administratorPhone, 'Administrator phone')
      return
    case 'teacher':
      requireText(form.fullName, 'Teacher full name', 3)
      requireText(form.schoolName, 'School name', 2)
      requireEmail(form.email, 'School email')
      requirePhone(form.phoneNumber, 'Phone number')
      requireText(form.roleDepartment, 'Role / Department', 2)
      requireText(form.gradeLevelSupported, 'Grade level supported', 1)
      return
  }
}


/* ============================ AUTH MODAL ============================ */
export function AuthModal({
  open, mode, onClose, onMode, initialRole,
}: {
  open: boolean
  mode: 'login' | 'register'
  onClose: () => void
  onMode: (m: 'login' | 'register') => void
  initialRole?: RegistrationRole | null
}) {
  const { login, register } = useAuth()
  type AuthResult = Awaited<ReturnType<typeof login>>
  const [form, setForm] = useState<RegisterFormState>(createRegisterForm())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ title: string; message: string } | null>(null)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [termsSig, setTermsSig] = useState('')
  const [nsSchools, setNsSchools] = useState<any[]>([])
  const [nsTeachers, setNsTeachers] = useState<any[]>([])

  useEffect(() => {
    if (open) {
      setError('')
      setDone(null)
      // Pre-select the User Type when launched from a role-specific button (e.g. hero "Student").
      setForm(mode === 'register' && initialRole
        ? { ...createRegisterForm(), role: initialRole }
        : createRegisterForm())
      setTermsAccepted(false)
      setTermsSig('')
    }
    document.body.style.overflow = open ? 'hidden' : ''
  }, [open, mode, initialRole])

  // Load the approved schools + teachers so challenge registration uses the same
  // dropdowns as the /new-school challenge page.
  useEffect(() => {
    if (!open) return
    api.get<any>('new-school/overview')
      .then((d) => {
        setNsSchools(Array.isArray(d?.schools) ? d.schools : [])
        setNsTeachers(Array.isArray(d?.teachers) ? d.teachers : [])
      })
      .catch(() => {})
  }, [open])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const finishSuccess = (result: AuthResult) => {
    const firstName = (result.user?.full_name || '').trim().split(/\s+/)[0] || 'there'
    const approvalStatus = (result.user?.approval_status || 'approved').toString()
    if (approvalStatus === 'approved') {
      setDone({
        title: `Welcome, ${firstName}`,
        message: result.user?.role === 'member'
          ? 'Your member account is active.'
          : 'Your account is active and ready to use.',
      })
      return
    }

    setDone({
      title: `Request received, ${firstName}`,
      message: 'Your account is pending admin approval. You can keep browsing the public site, and we will unlock access after review.',
    })
  }

  const handleAuthResult = async (result: AuthResult) => {
    if (!result.user) {
      throw new Error('Unexpected authentication response from the server.')
    }

    finishSuccess(result)
    setForm(createRegisterForm())
  }

  const updateField = <K extends keyof RegisterFormState>(key: K, value: RegisterFormState[K]) => {
    let nextValue = value
    if (typeof nextValue === 'string' && phoneFieldKeySet.has(key as RegisterTextFieldKey)) {
      nextValue = digitsOnly(nextValue) as RegisterFormState[K]
    }
    setForm((current) => ({ ...current, [key]: nextValue }))
  }

  const renderTextField = (
    key: RegisterTextFieldKey,
    label: string,
    options: {
      as?: 'input' | 'textarea'
      type?: string
      placeholder?: string
      full?: boolean
      rows?: number
      required?: boolean
      autoComplete?: string
      min?: number
      max?: number
      step?: number | string
      minLength?: number
      maxLength?: number
      inputMode?: 'none' | 'text' | 'tel' | 'url' | 'email' | 'numeric' | 'decimal' | 'search'
      pattern?: string
    } = {},
  ) => {
    const fieldClass = `field${options.full ? ' field--full' : ''}`
    const value = form[key]

    return (
      <div className={fieldClass}>
        <label>{label}</label>
        {options.as === 'textarea' ? (
          <textarea
            className="fld-area"
            rows={options.rows ?? 4}
            required={options.required ?? true}
            placeholder={options.placeholder}
            value={value}
            onChange={(e) => updateField(key, e.target.value as RegisterFormState[typeof key])}
          />
        ) : (
          <input
            type={options.type ?? 'text'}
            required={options.required ?? true}
            placeholder={options.placeholder}
            autoComplete={options.autoComplete}
            min={options.min}
            max={options.max}
            step={options.step}
            minLength={options.minLength}
            maxLength={options.maxLength}
            inputMode={options.inputMode}
            pattern={options.pattern}
            value={value}
            onChange={(e) => updateField(key, e.target.value as RegisterFormState[typeof key])}
          />
        )}
      </div>
    )
  }

  const renderCheckbox = (label: string, helper: string) => (
    <div className="field field--check field--full">
      <input
        id="auth-register-consent"
        type="checkbox"
        checked={form.consentChecked}
        required
        onChange={(e) => updateField('consentChecked', e.target.checked)}
      />
      <label htmlFor="auth-register-consent">
        <span>{label}</span>
        <small>{helper}</small>
      </label>
    </div>
  )

  const roleMeta = registerRoleMeta[form.role]
  const title = mode === 'login' ? 'Welcome Back' : roleMeta.title
  const subtitle = mode === 'login' ? 'Sign in to your community account.' : roleMeta.subtitle
  const submitLabel = mode === 'login' ? 'Login' : roleMeta.button

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    try {
      if (mode === 'login') {
        requireEmail(form.email, 'Email address')
        if (!form.password) {
          throw new Error('Password is required.')
        }
      } else {
        validateRegisterForm(form, termsAccepted)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Please review the form and try again.')
      return
    }

    setBusy(true)
    try {
      const result = mode === 'login'
        ? await login(form.email, form.password)
        : await register({
          role: form.role,
          fullName: normalizeSpaces(form.fullName),
          email: form.email.trim().toLowerCase(),
          password: form.password,
          studentUsername: form.studentUsername.trim(),
          age: form.age.trim(),
          dateOfBirth: form.dateOfBirth,
          phoneNumber: digitsOnly(form.phoneNumber),
          homeAddress: normalizeSpaces(form.homeAddress),
          schoolName: normalizeSpaces(form.schoolName),
          schoolId: form.schoolId,
          teacherId: form.teacherId,
          gradeLevel: normalizeSpaces(form.gradeLevel),
          parentName: normalizeSpaces(form.parentName),
          parentPhone: digitsOnly(form.parentPhone),
          parentEmail: form.parentEmail.trim().toLowerCase(),
          qrToken: form.qrToken.trim(),
          relationshipToStudent: normalizeSpaces(form.relationshipToStudent),
          governmentIdUrl: form.governmentIdUrl.trim(),
          digitalSignature: normalizeSpaces(form.digitalSignature || termsSig || form.fullName),
          schoolAddress: normalizeSpaces(form.schoolAddress),
          schoolDistrict: normalizeSpaces(form.schoolDistrict),
          mainPhone: digitsOnly(form.mainPhone),
          principalName: normalizeSpaces(form.principalName),
          administratorPhone: digitsOnly(form.administratorPhone),
          roleDepartment: normalizeSpaces(form.roleDepartment),
          gradeLevelSupported: normalizeSpaces(form.gradeLevelSupported),
          consentChecked: termsAccepted || form.consentChecked,
        })
      await handleAuthResult(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`modal-overlay${open ? ' open' : ''}`} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${mode === 'register' ? ' modal--register' : ''}`}>
        <button className="close" onClick={onClose} aria-label="Close"><CloseIcon /></button>
        <Mono />

        {done ? (
          <div style={{ textAlign: 'center' }}>
            <OkIcon />
            <h3 className="gold-text">{done.title}</h3>
            <p className="msub">{done.message}</p>
            <button className="btn btn--solid" onClick={onClose}>Continue</button>
          </div>
        ) : (
          <div>
            <h3 className="gold-text">{title}</h3>
            <p className="msub">{subtitle}</p>
            <form onSubmit={submit} className={mode === 'register' ? 'auth-form auth-form--register' : 'auth-form'}>
              {mode === 'register' ? (
                <>
                  <div className="field field--full">
                    <label>User Type</label>
                    <select
                      value={form.role}
                      onChange={(e) => updateField('role', e.target.value as RegistrationRole)}
                    >
                      {registerRoleOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="auth-note">{roleMeta.helper}</p>

                  <div className="auth-grid">
                    {form.role === 'community' && (
                      <>
                        {renderTextField('fullName', 'Full Name', { full: true, placeholder: 'Your name', autoComplete: 'name', minLength: 3 })}
                        {renderTextField('email', 'Email Address', { type: 'email', full: true, placeholder: 'you@example.com', autoComplete: 'email' })}
                        {renderTextField('password', 'Password', { type: 'password', placeholder: 'Create a password', autoComplete: 'new-password', minLength: 6 })}
                        {renderTextField('confirmPassword', 'Confirm Password', { type: 'password', placeholder: 'Repeat the password', autoComplete: 'new-password', minLength: 6 })}
                      </>
                    )}

                    {form.role === 'student' && (
                      <>
                        {renderTextField('fullName', 'Student Full Name', { full: true, placeholder: 'Student full name', autoComplete: 'name', minLength: 3 })}
                        {renderTextField('studentUsername', 'Student Username', { placeholder: 'Choose a username', minLength: 3, maxLength: 30, pattern: '[A-Za-z0-9._-]+' })}
                        <div className="field">
                          <label>Date of Birth</label>
                          <input type="date" value={form.dateOfBirth} onChange={(e) => setForm((p) => ({ ...p, dateOfBirth: e.target.value, age: ageFromDob(e.target.value) }))} />
                        </div>
                        <div className="field">
                          <label>Age</label>
                          <input type="number" value={form.age} readOnly placeholder="Auto from date of birth" />
                        </div>
                        {renderTextField('email', 'Student Email', { type: 'email', full: true, placeholder: 'student@example.com', autoComplete: 'email' })}
                        {renderTextField('phoneNumber', 'Phone Number', { type: 'tel', placeholder: 'Student phone number', autoComplete: 'tel', inputMode: 'numeric', pattern: '[0-9]*', maxLength: 15 })}
                        <div className="field">
                          <label>School</label>
                          <select value={form.schoolId} required onChange={(e) => {
                            const sc = nsSchools.find((s: any) => String(s.id) === e.target.value)
                            setForm((p) => ({ ...p, schoolId: e.target.value, schoolName: sc?.school_name || '', teacherId: '' }))
                          }}>
                            <option value="">{nsSchools.length ? 'Select your school' : 'No approved schools yet'}</option>
                            {nsSchools.map((s: any) => (
                              <option key={s.id} value={s.id}>{s.school_name}{s.school_district ? ` — ${s.school_district}` : ''}</option>
                            ))}
                          </select>
                        </div>
                        <div className="field">
                          <label>Teacher</label>
                          <select value={form.teacherId} required onChange={(e) => updateField('teacherId', e.target.value)}>
                            <option value="">{form.schoolId ? 'Select a teacher' : 'Choose a school first'}</option>
                            {nsTeachers.filter((t: any) => String(t.school_id) === String(form.schoolId)).map((t: any) => (
                              <option key={t.id} value={t.id}>{t.teacher_full_name}{t.role_department ? ` — ${t.role_department}` : ''}</option>
                            ))}
                          </select>
                        </div>
                        {renderTextField('gradeLevel', 'Grade Level', { placeholder: 'Example: 9th Grade' })}
                        {renderTextField('homeAddress', 'Home Address', { as: 'textarea', full: true, placeholder: 'Street address, city, state, zip', rows: 3 })}
                        {renderTextField('parentName', 'Parent / Guardian Name', { placeholder: 'Parent or guardian', minLength: 3 })}
                        {renderTextField('parentPhone', 'Parent Phone Number', { type: 'tel', placeholder: 'Parent contact number', autoComplete: 'tel', inputMode: 'numeric', pattern: '[0-9]*', maxLength: 15 })}
                        {renderTextField('parentEmail', 'Parent Email Address', { type: 'email', placeholder: 'parent@example.com', autoComplete: 'email' })}
                        {renderTextField('password', 'Password', { type: 'password', placeholder: 'Create a password', autoComplete: 'new-password' })}
                        {renderTextField('confirmPassword', 'Confirm Password', { type: 'password', placeholder: 'Repeat the password', autoComplete: 'new-password' })}
                      </>
                    )}

                    {form.role === 'parent' && (
                      <>
                        {renderTextField('qrToken', 'Student QR Token', { full: true, placeholder: 'Scan or paste the QR token' })}
                        {renderTextField('fullName', 'Parent Full Name', { full: true, placeholder: 'Parent or guardian name', autoComplete: 'name', minLength: 3 })}
                        {renderTextField('relationshipToStudent', 'Relationship To Student', { placeholder: 'Mother, father, guardian' })}
                        {renderTextField('phoneNumber', 'Phone Number', { type: 'tel', placeholder: 'Parent phone number', autoComplete: 'tel', inputMode: 'numeric', pattern: '[0-9]*', maxLength: 15 })}
                        {renderTextField('email', 'Email Address', { type: 'email', placeholder: 'parent@example.com', autoComplete: 'email' })}
                        {renderTextField('homeAddress', 'Home Address', { as: 'textarea', full: true, placeholder: 'Street address, city, state, zip', rows: 3 })}
                        {renderTextField('governmentIdUrl', 'Government ID URL', { full: true, type: 'url', placeholder: 'Optional ID link', required: false })}
                        {renderTextField('digitalSignature', 'Digital Signature', { full: true, placeholder: 'Type your full name as signature', minLength: 3 })}
                        {renderTextField('password', 'Password', { type: 'password', placeholder: 'Create a password', autoComplete: 'new-password' })}
                        {renderTextField('confirmPassword', 'Confirm Password', { type: 'password', placeholder: 'Repeat the password', autoComplete: 'new-password' })}
                      </>
                    )}

                    {form.role === 'school' && (
                      <>
                        {renderTextField('schoolName', 'School Name', { full: true, placeholder: 'Official school name', autoComplete: 'organization' })}
                        {renderTextField('schoolAddress', 'School Address', { as: 'textarea', full: true, placeholder: 'School street address', rows: 3 })}
                        {renderTextField('schoolDistrict', 'School District', { placeholder: 'District name' })}
                        {renderTextField('mainPhone', 'Main Phone Number', { type: 'tel', placeholder: 'Main school phone', autoComplete: 'tel', inputMode: 'numeric', pattern: '[0-9]*', maxLength: 15 })}
                        {renderTextField('principalName', 'Principal Name', { placeholder: 'Principal full name', minLength: 3 })}
                        {renderTextField('fullName', 'Administrator Name', { placeholder: 'School administrator name', autoComplete: 'name', minLength: 3 })}
                        {renderTextField('email', 'Administrator Email', { type: 'email', placeholder: 'administrator@example.com', autoComplete: 'email' })}
                        {renderTextField('administratorPhone', 'Administrator Phone', { type: 'tel', placeholder: 'Administrator phone number', autoComplete: 'tel', inputMode: 'numeric', pattern: '[0-9]*', maxLength: 15 })}
                        {renderTextField('password', 'Password', { type: 'password', placeholder: 'Create a password', autoComplete: 'new-password' })}
                        {renderTextField('confirmPassword', 'Confirm Password', { type: 'password', placeholder: 'Repeat the password', autoComplete: 'new-password' })}
                      </>
                    )}

                    {form.role === 'teacher' && (
                      <>
                        {renderTextField('fullName', 'Teacher Full Name', { full: true, placeholder: 'Teacher full name', autoComplete: 'name', minLength: 3 })}
                        <div className="field">
                          <label>School</label>
                          <select value={form.schoolId} required onChange={(e) => {
                            const sc = nsSchools.find((s: any) => String(s.id) === e.target.value)
                            setForm((p) => ({ ...p, schoolId: e.target.value, schoolName: sc?.school_name || '' }))
                          }}>
                            <option value="">{nsSchools.length ? 'Select your school' : 'No approved schools yet'}</option>
                            {nsSchools.map((s: any) => (
                              <option key={s.id} value={s.id}>{s.school_name}{s.school_district ? ` — ${s.school_district}` : ''}</option>
                            ))}
                          </select>
                        </div>
                        {renderTextField('email', 'School Email', { type: 'email', placeholder: 'teacher@school.edu', autoComplete: 'email' })}
                        {renderTextField('phoneNumber', 'Phone Number', { type: 'tel', placeholder: 'Teacher phone number', autoComplete: 'tel', inputMode: 'numeric', pattern: '[0-9]*', maxLength: 15 })}
                        {renderTextField('roleDepartment', 'Role / Department', { placeholder: 'Example: Social Studies' })}
                        {renderTextField('gradeLevelSupported', 'Grade Level Supported', { placeholder: 'Example: 9th Grade' })}
                        {renderTextField('password', 'Password', { type: 'password', placeholder: 'Create a password', autoComplete: 'new-password' })}
                        {renderTextField('confirmPassword', 'Confirm Password', { type: 'password', placeholder: 'Repeat the password', autoComplete: 'new-password' })}
                      </>
                    )}
                  </div>
                  <TermsAgreement
                    kind={form.role === 'community' ? 'website' : form.role}
                    idPrefix="auth"
                    hideSignature={form.role === 'parent'}
                    signatureName={termsSig}
                    onSignatureChange={setTermsSig}
                    onAcceptedChange={setTermsAccepted}
                  />
                </>
              ) : (
                <>
                  <div className="field">
                    <label>Email</label>
                    <input type="email" required placeholder="you@example.com" autoComplete="email" value={form.email} onChange={(e) => updateField('email', e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Password</label>
                    <input type="password" required placeholder="Enter your password" autoComplete="current-password" value={form.password} onChange={(e) => updateField('password', e.target.value)} />
                  </div>
                </>
              )}
              {error && <p className="msub" style={{ color: '#e08a8a' }}>{error}</p>}
              <button type="submit" className="btn btn--solid" disabled={busy || (mode === 'register' && !termsAccepted)}>
                {busy ? (mode === 'login' ? 'Signing in...' : 'Submitting...') : submitLabel}
              </button>
            </form>
            {mode === 'login' ? (
              <div className="switch">New here? <a onClick={() => onMode('register')}>Create an account</a></div>
            ) : (
              <div className="switch">Already a member? <a onClick={() => onMode('login')}>Sign in</a></div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ====================== REQUEST / APPLY MODAL ====================== */
function tailor(label: string): { sub: string; btn: string } {
  const l = label.toLowerCase()
  if (l.includes('apply') || l.includes('broker')) return { sub: 'Apply below - we review every application personally.', btn: 'Submit Application' }
  if (l.includes('pin')) return { sub: 'Claim your official FC pin. We will send next steps to your inbox.', btn: 'Claim My Pin' }
  if (l.includes('giveaway') || l.includes('challenge') || l.includes('entry')) return { sub: 'Enter below. Good luck - winners are notified by email.', btn: 'Confirm Entry' }
  if (l.includes('invite')) return { sub: 'Share your event details and we will review the invitation.', btn: 'Send Invitation' }
  if (l.includes('sponsor')) return { sub: 'Tell us about your company and goals for sponsorship.', btn: 'Request Package' }
  if (l.includes('media kit')) return { sub: 'Confirm your details and we will send the full media kit.', btn: 'Send Me the Kit' }
  if (l.includes('mentor')) return { sub: 'Share where you are and where you want to go.', btn: 'Submit' }
  return { sub: 'Tell us a few details and the team will follow up.', btn: 'Submit Request' }
}

export function RequestModal({ label, onClose }: { label: string | null; onClose: () => void }) {
  const open = label !== null
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [org, setOrg] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)

  useEffect(() => {
    if (open) { setError(''); setDone(false); setName(''); setEmail(''); setOrg(''); setMessage(''); setTermsAccepted(false) }
    document.body.style.overflow = open ? 'hidden' : ''
  }, [open])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!open) return <div className="modal-overlay" />
  const t = tailor(label)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.post('request', { request_type: label, full_name: name, email, organization: org, message })
      recordTermsAcceptance({ kind: 'website', signature: name, email, documentLabel: `Request: ${label || 'Booking / Media'}` })
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <button className="close" onClick={onClose} aria-label="Close"><CloseIcon /></button>
        <Mono />
        {done ? (
          <div style={{ textAlign: 'center' }}>
            <OkIcon />
            <h3 className="gold-text">Received - Thank You</h3>
            <p className="msub">Your request has been sent. The team will be in touch shortly.</p>
            <button className="btn btn--solid" onClick={onClose}>Done</button>
          </div>
        ) : (
          <div>
            <h3 className="gold-text">{label}</h3>
            <p className="msub">{t.sub}</p>
            <form onSubmit={submit}>
              <div className="field">
                <label>Full Name</label>
                <input type="text" required placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="field">
                <label>Email</label>
                <input type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="field">
                <label>Organization</label>
                <input type="text" placeholder="Company / outlet (optional)" value={org} onChange={(e) => setOrg(e.target.value)} />
              </div>
              <div className="field">
                <label>Message</label>
                <textarea className="fld-area" placeholder="Share the details..." value={message} onChange={(e) => setMessage(e.target.value)} />
              </div>
              <TermsAgreement kind="website" idPrefix="request" hideSignature signatureName="" onSignatureChange={() => {}} onAcceptedChange={setTermsAccepted} />
              {error && <p className="msub" style={{ color: '#e08a8a' }}>{error}</p>}
              <button type="submit" className="btn btn--solid" disabled={busy || !termsAccepted}>{busy ? 'Sending...' : t.btn}</button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
