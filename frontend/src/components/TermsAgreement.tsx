import { useEffect, useMemo, useRef, useState } from 'react'
import { TERMS_LAYOUT, checkboxesFor, type TermsKind, type TermsItem } from '../lib/terms'

interface TermsAgreementProps {
  kind: TermsKind
  signatureName: string
  onSignatureChange: (value: string) => void
  onAcceptedChange: (accepted: boolean) => void
  /** Namespaces checkbox ids when more than one agreement is on the page. */
  idPrefix?: string
  /** Default true — acceptance also requires a non-empty signature. */
  requireSignature?: boolean
  /** Hide the signature input (e.g. a form that already captures a digital signature). */
  hideSignature?: boolean
  signatureLabel?: string
  className?: string
}

/**
 * Reusable Terms agreement: an inline scrollable terms box with the required
 * checkboxes + an electronic-signature name field. Reports `accepted=true` only when
 * every required box is checked AND (unless hidden) the signature is filled.
 */
export default function TermsAgreement({
  kind,
  signatureName,
  onSignatureChange,
  onAcceptedChange,
  idPrefix = 'terms',
  requireSignature = true,
  hideSignature = false,
  signatureLabel = 'Type your full name',
  className,
}: TermsAgreementProps) {
  const items = TERMS_LAYOUT[kind]
  const boxes = useMemo(() => checkboxesFor(kind), [kind])
  const [checks, setChecks] = useState<Record<string, boolean>>({})

  // Clear ticks when the agreement kind changes (e.g. role switch in the register modal).
  useEffect(() => {
    setChecks({})
  }, [kind])

  const allChecked = boxes.every((b) => checks[b.id])
  const signatureOk = !requireSignature || hideSignature || signatureName.trim().length > 0
  const accepted = allChecked && signatureOk

  // Report acceptance only when it actually changes, always via the latest callback —
  // safe even if the parent passes a new inline callback every render.
  const acceptedCbRef = useRef(onAcceptedChange)
  acceptedCbRef.current = onAcceptedChange
  useEffect(() => {
    acceptedCbRef.current(accepted)
  }, [accepted])

  // Long descriptive text scrolls inside the box; the actual checkboxes + signature
  // ALWAYS render below it (never hidden behind the scroll) so the form can be completed.
  const textItems = items.filter((it): it is Extract<TermsItem, { type: 'text' }> => it.type === 'text')
  const checkItems = items.filter((it): it is Extract<TermsItem, { type: 'check' }> => it.type === 'check')

  return (
    <div className={`terms-agreement ${className || ''}`}>
      {textItems.length > 0 && (
        <div className="terms-box" role="group" aria-label="Terms and conditions">
          {textItems.map((item, i) => (
            <div className="terms-box__text" key={`text-${i}`}>
              {item.heading && <p className="terms-box__heading">{item.heading}</p>}
              {item.intro && <p className="terms-box__intro">{item.intro}</p>}
              {item.bullets && (
                <ul className="terms-box__bullets">
                  {item.bullets.map((b, j) => (
                    <li key={j}>{b}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          <a className="terms-box__link" href="/terms" target="_blank" rel="noopener noreferrer">
            View full Terms of Use &amp; Privacy Notice
          </a>
        </div>
      )}

      <div className="terms-checks">
        {checkItems.map((item) => {
          const cid = `${idPrefix}-${item.id}`
          return (
            <div className="field field--check field--full terms-box__check" key={item.id}>
              <input
                id={cid}
                type="checkbox"
                checked={!!checks[item.id]}
                required
                onChange={(e) => setChecks((prev) => ({ ...prev, [item.id]: e.target.checked }))}
              />
              <label htmlFor={cid}>
                <span>{item.label}</span>
              </label>
            </div>
          )
        })}
      </div>

      {!hideSignature && (
        <label className="field field--full terms-agreement__sig">
          <span>{signatureLabel}</span>
          <input
            type="text"
            value={signatureName}
            onChange={(e) => onSignatureChange(e.target.value)}
            placeholder="Type full name"
            autoComplete="name"
          />
        </label>
      )}
    </div>
  )
}
