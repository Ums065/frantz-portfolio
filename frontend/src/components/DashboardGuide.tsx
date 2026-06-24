import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { DASHBOARD_GUIDE, type GuideSlide } from '../lib/dashboardGuide'

/**
 * Role-specific guided tour + rule book. Steps through each dashboard tab, ends on
 * a numbered rule book with an Accept button. Shown on first visit, reopenable anytime.
 */
export default function DashboardGuide({ role, open, onClose }: { role: string; open: boolean; onClose: () => void }) {
  const guide = DASHBOARD_GUIDE[role] || DASHBOARD_GUIDE.student
  const [step, setStep] = useState(0)

  useEffect(() => { if (open) setStep(0) }, [open, role])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !guide) return null

  const rulesSlide: GuideSlide & { isRules?: boolean } = {
    title: 'Rules & Guidelines',
    intro: 'Please read these points, then accept to continue.',
    points: guide.rules,
    isRules: true,
  }
  const slides: Array<GuideSlide & { isRules?: boolean }> = [...guide.slides, rulesSlide]
  const total = slides.length
  const current = slides[Math.min(step, total - 1)]
  const isLast = step >= total - 1

  return createPortal(
    <div className="ns-guide-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="ns-guide glass" role="dialog" aria-modal="true" aria-label="Dashboard guide and rule book">
        <button className="ns-guide__close" type="button" aria-label="Close guide" onClick={onClose}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>

        {step === 0 && <p className="ns-guide__welcome">{guide.welcome}</p>}

        <div className="ns-guide__head">
          <span className="eyebrow">{current.isRules ? 'Rule Book' : 'Guide'} · Step {step + 1} of {total}</span>
          <h3>{current.title}</h3>
          {current.intro && <p className="ns-guide__intro">{current.intro}</p>}
        </div>

        <ol className={`ns-guide__points${current.isRules ? ' ns-guide__points--rules' : ''}`}>
          {current.points.map((p, i) => <li key={i}>{p}</li>)}
        </ol>

        <div className="ns-guide__dots" aria-hidden="true">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`ns-guide__dot${i === step ? ' is-active' : ''}`}
              onClick={() => setStep(i)}
              aria-label={`Go to step ${i + 1}`}
            />
          ))}
        </div>

        <div className="ns-guide__foot">
          <button className="btn" type="button" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>‹ Previous</button>
          {isLast
            ? <button className="btn btn--solid" type="button" onClick={onClose}>Accept &amp; Get Started</button>
            : <button className="btn btn--solid" type="button" onClick={() => setStep((s) => Math.min(total - 1, s + 1))}>Next ›</button>}
        </div>
      </div>
    </div>,
    document.body,
  )
}
