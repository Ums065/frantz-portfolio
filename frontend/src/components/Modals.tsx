import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

const Mono = () => (
  <div className="mmono"><img src="/assets/fc-logo.png" alt="FC" /></div>
)

const OkIcon = () => (
  <div className="ok-icon">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <path d="M8 12.5l2.5 2.5L16 9" />
    </svg>
  </div>
)

/* ============================ AUTH MODAL ============================ */
export function AuthModal({
  open, mode, onClose, onMode,
}: {
  open: boolean
  mode: 'login' | 'register'
  onClose: () => void
  onMode: (m: 'login' | 'register') => void
}) {
  const { login, register, verifyEmail, resendVerification } = useAuth()
  type AuthResult = Awaited<ReturnType<typeof login>>
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const [resendBusy, setResendBusy] = useState(false)
  const [step, setStep] = useState<'form' | 'verify' | 'done'>('form')
  const [done, setDone] = useState<string | null>(null)
  const [verificationEmail, setVerificationEmail] = useState('')

  useEffect(() => {
    if (open) {
      setError('')
      setInfo('')
      setDone(null)
      setStep('form')
      setOtp('')
      setVerificationEmail('')
    }
    document.body.style.overflow = open ? 'hidden' : ''
  }, [open, mode])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const resetToForm = () => {
    setError('')
    setInfo('')
    setOtp('')
    setStep('form')
  }

  const openVerificationStep = (nextEmail: string, message?: string) => {
    setVerificationEmail(nextEmail)
    setInfo(message ?? '')
    setError('')
    setOtp('')
    setStep('verify')
  }

  const finishSuccess = (fullName: string) => {
    const firstName = (fullName || '').trim().split(/\s+/)[0] || 'Welcome'
    setDone(firstName)
    setStep('done')
    setName('')
    setEmail('')
    setPassword('')
    setOtp('')
    setVerificationEmail('')
    setInfo('')
  }

  const handleAuthResult = async (result: AuthResult) => {
    if (result.verificationRequired) {
      const verificationMessage = result.message
        || (result.verificationEmailSent === false
          ? 'We created your account, but could not deliver the verification code right now. Please try Resend code after checking your email settings.'
          : undefined)
      openVerificationStep(result.verificationEmail || email, verificationMessage)
      setPassword('')
      return
    }

    if (!result.user) {
      throw new Error('Unexpected authentication response from the server.')
    }

    finishSuccess(result.user.full_name)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (step === 'verify') {
        const user = await verifyEmail(verificationEmail || email, otp.trim())
        finishSuccess(user.full_name)
        return
      }

      const result = mode === 'login'
        ? await login(email, password)
        : await register(name, email, password)
      await handleAuthResult(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  const resendCode = async () => {
    if (!verificationEmail && !email) {
      setError('Please enter your email first.')
      return
    }

    setResendBusy(true)
    setError('')
    try {
      const message = await resendVerification(verificationEmail || email)
      setInfo(message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to resend code right now.')
    } finally {
      setResendBusy(false)
    }
  }

  const stepTitle = step === 'verify' ? 'Verify your email' : mode === 'login' ? 'Welcome Back' : 'Join the Community'
  const stepSubtitle = step === 'verify'
    ? (info || `We sent a 6-digit code to ${verificationEmail || email}.`)
    : mode === 'login'
      ? 'Sign in to your community account.'
      : 'Exclusive access. Real impact.'

  return (
    <div className={`modal-overlay${open ? ' open' : ''}`} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <button className="close" onClick={onClose} aria-label="Close"><CloseIcon /></button>
        <Mono />

        {done ? (
          <div style={{ textAlign: 'center' }}>
            <OkIcon />
            <h3 className="gold-text">Welcome, {done}</h3>
            <p className="msub">You are now part of the legacy. Watch your inbox for VIP updates and early access.</p>
            <button className="btn btn--solid" onClick={onClose}>Continue</button>
          </div>
        ) : (
          <div>
            <h3 className="gold-text">{stepTitle}</h3>
            <p className="msub">{stepSubtitle}</p>
            <form onSubmit={submit}>
              {step === 'verify' ? (
                <div className="field">
                  <label>Verification Code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    required
                    placeholder="6-digit code"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  />
                </div>
              ) : (
                <>
                  {mode === 'register' && (
                    <div className="field">
                      <label>Full Name</label>
                      <input type="text" required placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
                    </div>
                  )}
                  <div className="field">
                    <label>Email</label>
                    <input type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Password</label>
                    <input type="password" required placeholder="Create a password" value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                </>
              )}
              {error && <p className="msub" style={{ color: '#e08a8a' }}>{error}</p>}
              <button type="submit" className="btn btn--solid" disabled={busy}>
                {busy ? (step === 'verify' ? 'Verifying...' : mode === 'login' ? 'Signing in...' : 'Creating...') : (step === 'verify' ? 'Verify Email' : mode === 'login' ? 'Login' : 'Register Now')}
              </button>
            </form>
            {step === 'verify' ? (
              <>
                <div className="switch">
                  Didn't get the code? <a onClick={resendCode}>{resendBusy ? 'Sending...' : 'Resend code'}</a>
                </div>
                <div className="switch">Need to update your details? <a onClick={resetToForm}>Back</a></div>
              </>
            ) : mode === 'login' ? (
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

  useEffect(() => {
    if (open) { setError(''); setDone(false); setName(''); setEmail(''); setOrg(''); setMessage('') }
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
              {error && <p className="msub" style={{ color: '#e08a8a' }}>{error}</p>}
              <button type="submit" className="btn btn--solid" disabled={busy}>{busy ? 'Sending...' : t.btn}</button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
