import { useEffect } from 'react'
import { createPortal } from 'react-dom'

export type ScholarshipAnswerView = { key?: string; question: string; answer: string }

type Kind = 'interview' | 'project'

type Props = {
  open: boolean
  onClose: () => void
  kind: Kind
  record: Record<string, any> | null
  scholarship?: ScholarshipAnswerView[]
  /** Show the student name + ID header line (admin view). */
  showStudent?: boolean
}

// Short "facts" fields (rendered as a label/value grid).
const FACT_FIELDS: Record<Kind, [string, string][]> = {
  interview: [
    ['Visit number', 'visit_number'],
    ['Business name', 'business_name'],
    ['Owner / Manager', 'owner_name'],
    ['Phone', 'business_phone'],
    ['Address', 'business_address'],
    ['Category', 'business_category'],
    ['Date of visit', 'date_of_visit'],
  ],
  project: [
    ['Status', 'status'],
    ['Score', 'score'],
    ['Rank', 'rank_position'],
    ['Linked business', 'source_business_name'],
    ['Submitted', 'submission_date'],
  ],
}

// Long-form answer fields (rendered as labelled paragraphs).
const LONG_FIELDS: Record<Kind, [string, string][]> = {
  interview: [
    ['Main challenge', 'main_challenge'],
    ['Student notes', 'student_notes'],
  ],
  project: [
    ['Problem identified', 'problem_identified'],
    ['Why it matters', 'why_it_matters'],
    ['Proposed solution', 'proposed_solution'],
    ['How it helps', 'how_it_helps'],
    ['Expected impact', 'expected_impact'],
  ],
}

const CHECKLIST: [string, string][] = [
  ['Website', 'has_website'],
  ['Google Business Profile', 'has_google_profile'],
  ['Social Media', 'uses_social_media'],
  ['Digital Signage', 'uses_digital_signage'],
  ['Coupons / Rewards', 'offers_rewards'],
  ['Online Ordering', 'has_online_ordering'],
  ['Delivery Options', 'has_delivery_options'],
]

const truthy = (v: any) => v === true || v === 1 || v === '1' || v === 'yes' || v === 'true'
const hasValue = (v: any) => v !== null && v !== undefined && String(v).trim() !== ''

// The inner content of a record (facts + checklist + long answers + uploads),
// without the modal shell — reused inside the full student profile.
export function NsRecordBody({ kind, record }: { kind: Kind; record: Record<string, any> }) {
  const facts = FACT_FIELDS[kind].filter(([, k]) => hasValue(record[k]))
  const longs = LONG_FIELDS[kind].filter(([, k]) => hasValue(record[k]))
  const checks = kind === 'interview' ? CHECKLIST : []
  const links: [string, string][] = kind === 'project'
    ? ([['Video upload', 'video_url'], ['Written upload', 'written_url']] as [string, string][]).filter(([, k]) => hasValue(record[k]))
    : []
  return (
    <>
      {facts.length > 0 && (
        <div className="ns-detail__facts">
          {facts.map(([label, k]) => (
            <div key={k} className="ns-detail__fact">
              <span>{label}</span>
              <strong>{String(record[k])}</strong>
            </div>
          ))}
        </div>
      )}
      {checks.length > 0 && (
        <section className="ns-detail__section">
          <h4>Business checklist</h4>
          <div className="ns-detail__chips">
            {checks.map(([label, k]) => (
              <span key={k} className={`ns-detail__chip ${truthy(record[k]) ? 'is-yes' : 'is-no'}`}>
                {truthy(record[k]) ? '✓' : '✕'} {label}
              </span>
            ))}
          </div>
        </section>
      )}
      {longs.map(([label, k]) => (
        <section key={k} className="ns-detail__section">
          <h4>{label}</h4>
          <p className="ns-detail__text">{String(record[k])}</p>
        </section>
      ))}
      {links.length > 0 && (
        <section className="ns-detail__section">
          <h4>Uploads</h4>
          <div className="ns-detail__links">
            {links.map(([label, k]) => (
              <a key={k} className="btn btn--sm" href={String(record[k])} target="_blank" rel="noreferrer">{label}</a>
            ))}
          </div>
        </section>
      )}
    </>
  )
}

export default function NsRecordDetail({ open, onClose, kind, record, scholarship = [], showStudent = false }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !record) return null

  const title = kind === 'interview'
    ? `Business Interview${record.visit_number ? ` · Visit ${record.visit_number}` : ''}`
    : 'Project Submission'

  return createPortal(
    <div className="ns-detail__overlay" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="ns-detail glass" onClick={(e) => e.stopPropagation()}>
        <header className="ns-detail__head">
          <div>
            <span className="eyebrow">{kind === 'interview' ? 'Interview details' : 'Project details'}</span>
            <h3>{title}</h3>
            {showStudent && (
              <p className="ns-detail__sub">
                {record.student_name || '—'}
                {record.participant_id ? ` · ID ${record.participant_id}` : ''}
                {record.school_name ? ` · ${record.school_name}` : ''}
              </p>
            )}
          </div>
          <button type="button" className="ns-detail__close" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="ns-detail__body">
          <NsRecordBody kind={kind} record={record} />

          {scholarship.length > 0 && (
            <section className="ns-detail__section ns-detail__section--scholar">
              <h4>Scholarship answers</h4>
              {scholarship.map((qa, i) => (
                <div key={qa.key || i} className="ns-detail__qa">
                  <strong>{qa.question}</strong>
                  <p className="ns-detail__text">{qa.answer}</p>
                </div>
              ))}
            </section>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
