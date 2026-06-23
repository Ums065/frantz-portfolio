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

/* ============================ AUTH MODAL ============================ */
export function AuthModal({
  open, mode, onClose, onMode,
}: {
  open: boolean
  mode: 'login' | 'register'
  onClose: () => void
  onMode: (m: 'login' | 'register') => void
}) {
  const { login, register } = useAuth()
  type AuthResult = Awaited<ReturnType<typeof login>>
  const [form, setForm] = useState<RegisterFormState>(createRegisterForm())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ title: string; message: string } | null>(null)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [termsSig, setTermsSig] = useState('')

  useEffect(() => {
    if (open) {
      setError('')
      setDone(null)
      setForm(createRegisterForm())
      setTermsAccepted(false)
      setTermsSig('')
    }
    document.body.style.overflow = open ? 'hidden' : ''
  }, [open, mode])

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
    setForm((current) => ({ ...current, [key]: value }))
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
    setBusy(true)
    setError('')
    try {
      if (mode === 'register' && form.password !== form.confirmPassword) {
        throw new Error('Passwords do not match.')
      }

      const result = mode === 'login'
        ? await login(form.email, form.password)
        : await register({
          role: form.role,
          fullName: form.fullName,
          email: form.email,
          password: form.password,
          studentUsername: form.studentUsername,
          age: form.age,
          dateOfBirth: form.dateOfBirth,
          phoneNumber: form.phoneNumber,
          homeAddress: form.homeAddress,
          schoolName: form.schoolName,
          gradeLevel: form.gradeLevel,
          parentName: form.parentName,
          parentPhone: form.parentPhone,
          parentEmail: form.parentEmail,
          qrToken: form.qrToken,
          relationshipToStudent: form.relationshipToStudent,
          governmentIdUrl: form.governmentIdUrl,
          digitalSignature: form.digitalSignature || termsSig || form.fullName,
          schoolAddress: form.schoolAddress,
          schoolDistrict: form.schoolDistrict,
          mainPhone: form.mainPhone,
          principalName: form.principalName,
          administratorPhone: form.administratorPhone,
          roleDepartment: form.roleDepartment,
          gradeLevelSupported: form.gradeLevelSupported,
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
                        {renderTextField('fullName', 'Full Name', { full: true, placeholder: 'Your name', autoComplete: 'name' })}
                        {renderTextField('email', 'Email Address', { type: 'email', full: true, placeholder: 'you@example.com', autoComplete: 'email' })}
                        {renderTextField('password', 'Password', { type: 'password', placeholder: 'Create a password', autoComplete: 'new-password' })}
                        {renderTextField('confirmPassword', 'Confirm Password', { type: 'password', placeholder: 'Repeat the password', autoComplete: 'new-password' })}
                      </>
                    )}

                    {form.role === 'student' && (
                      <>
                        {renderTextField('fullName', 'Student Full Name', { full: true, placeholder: 'Student full name', autoComplete: 'name' })}
                        {renderTextField('studentUsername', 'Student Username', { placeholder: 'Choose a username' })}
                        {renderTextField('age', 'Age', { type: 'number', placeholder: '11-19', min: 11, max: 19 })}
                        {renderTextField('dateOfBirth', 'Date of Birth', { type: 'date' })}
                        {renderTextField('email', 'Student Email', { type: 'email', full: true, placeholder: 'student@example.com', autoComplete: 'email' })}
                        {renderTextField('phoneNumber', 'Phone Number', { type: 'tel', placeholder: 'Student phone number', autoComplete: 'tel' })}
                        {renderTextField('schoolName', 'School Name', { placeholder: 'Current school name' })}
                        {renderTextField('gradeLevel', 'Grade Level', { placeholder: 'Example: 9th Grade' })}
                        {renderTextField('homeAddress', 'Home Address', { as: 'textarea', full: true, placeholder: 'Street address, city, state, zip', rows: 3 })}
                        {renderTextField('parentName', 'Parent / Guardian Name', { placeholder: 'Parent or guardian' })}
                        {renderTextField('parentPhone', 'Parent Phone Number', { type: 'tel', placeholder: 'Parent contact number', autoComplete: 'tel' })}
                        {renderTextField('parentEmail', 'Parent Email Address', { type: 'email', placeholder: 'parent@example.com', autoComplete: 'email' })}
                        {renderTextField('password', 'Password', { type: 'password', placeholder: 'Create a password', autoComplete: 'new-password' })}
                        {renderTextField('confirmPassword', 'Confirm Password', { type: 'password', placeholder: 'Repeat the password', autoComplete: 'new-password' })}
                      </>
                    )}

                    {form.role === 'parent' && (
                      <>
                        {renderTextField('qrToken', 'Student QR Token', { full: true, placeholder: 'Scan or paste the QR token' })}
                        {renderTextField('fullName', 'Parent Full Name', { full: true, placeholder: 'Parent or guardian name', autoComplete: 'name' })}
                        {renderTextField('relationshipToStudent', 'Relationship To Student', { placeholder: 'Mother, father, guardian' })}
                        {renderTextField('phoneNumber', 'Phone Number', { type: 'tel', placeholder: 'Parent phone number', autoComplete: 'tel' })}
                        {renderTextField('email', 'Email Address', { type: 'email', placeholder: 'parent@example.com', autoComplete: 'email' })}
                        {renderTextField('homeAddress', 'Home Address', { as: 'textarea', full: true, placeholder: 'Street address, city, state, zip', rows: 3 })}
                        {renderTextField('governmentIdUrl', 'Government ID URL', { full: true, type: 'url', placeholder: 'Optional ID link', required: false })}
                        {renderTextField('digitalSignature', 'Digital Signature', { full: true, placeholder: 'Type your full name as signature' })}
                        {renderTextField('password', 'Password', { type: 'password', placeholder: 'Create a password', autoComplete: 'new-password' })}
                        {renderTextField('confirmPassword', 'Confirm Password', { type: 'password', placeholder: 'Repeat the password', autoComplete: 'new-password' })}
                      </>
                    )}

                    {form.role === 'school' && (
                      <>
                        {renderTextField('schoolName', 'School Name', { full: true, placeholder: 'Official school name', autoComplete: 'organization' })}
                        {renderTextField('schoolAddress', 'School Address', { as: 'textarea', full: true, placeholder: 'School street address', rows: 3 })}
                        {renderTextField('schoolDistrict', 'School District', { placeholder: 'District name' })}
                        {renderTextField('mainPhone', 'Main Phone Number', { type: 'tel', placeholder: 'Main school phone', autoComplete: 'tel' })}
                        {renderTextField('principalName', 'Principal Name', { placeholder: 'Principal full name' })}
                        {renderTextField('fullName', 'Administrator Name', { placeholder: 'School administrator name', autoComplete: 'name' })}
                        {renderTextField('email', 'Administrator Email', { type: 'email', placeholder: 'administrator@example.com', autoComplete: 'email' })}
                        {renderTextField('administratorPhone', 'Administrator Phone', { type: 'tel', placeholder: 'Administrator phone number', autoComplete: 'tel' })}
                        {renderTextField('password', 'Password', { type: 'password', placeholder: 'Create a password', autoComplete: 'new-password' })}
                        {renderTextField('confirmPassword', 'Confirm Password', { type: 'password', placeholder: 'Repeat the password', autoComplete: 'new-password' })}
                      </>
                    )}

                    {form.role === 'teacher' && (
                      <>
                        {renderTextField('fullName', 'Teacher Full Name', { full: true, placeholder: 'Teacher full name', autoComplete: 'name' })}
                        {renderTextField('schoolName', 'School Name', { placeholder: 'School name' })}
                        {renderTextField('email', 'School Email', { type: 'email', placeholder: 'teacher@school.edu', autoComplete: 'email' })}
                        {renderTextField('phoneNumber', 'Phone Number', { type: 'tel', placeholder: 'Teacher phone number', autoComplete: 'tel' })}
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
