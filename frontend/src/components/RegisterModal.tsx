import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import ChallengeRegistration, { type RegistrationTag } from './ChallengeRegistration'

/**
 * Header "Register" popup. Renders the exact same challenge registration forms
 * (Student / Parent / School / Teacher) as the /new-school page, plus a Community
 * member signup. Closes itself after a successful registration.
 */
export default function RegisterModal({
  open,
  initialTag = 'student',
  onClose,
}: {
  open: boolean
  initialTag?: RegistrationTag
  onClose: () => void
}) {
  const [tag, setTag] = useState<RegistrationTag>(initialTag)

  useEffect(() => { if (open) setTag(initialTag) }, [open, initialTag])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    // Lock the background page scroll so the form scrolls on its own (no drifting page behind it).
    // Lock both <body> and <html>: depending on the page, the viewport scroll lives on the root
    // element, so a body-only lock can leave the page scrollable behind the popup.
    const prevBodyOverflow = document.body.style.overflow
    const prevHtmlOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevBodyOverflow
      document.documentElement.style.overflow = prevHtmlOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal modal--register ns-register-modal" role="dialog" aria-modal="true" aria-label="Register">
        <button className="close" type="button" aria-label="Close" onClick={onClose}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <div className="ns-register-modal__head">
          <span className="eyebrow">Register</span>
          <h2>Join the Student Impact Challenge</h2>
          <p>Choose your role — the matching fields appear below.</p>
        </div>
        <ChallengeRegistration tag={tag} onTagChange={setTag} showCommunity onSuccess={onClose} />
      </div>
    </div>,
    document.body,
  )
}
